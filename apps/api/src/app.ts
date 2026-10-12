import { nextReportAt, resolvePeriod, SyncRequestSchema } from '@hesabu/analytics';
import { randomBytes } from 'node:crypto';

import {
  AddressTakenError, ARTEFACT_KEY_PATTERN, ARTEFACT_URL_TTL_SECONDS, contentTypeFor, DeviceRevokedError, hashToken,
  signArtefactToken, signDeviceToken, verifyArtefactToken, verifyDeviceToken, verifyReportLinkToken, type Db, type Storage, type TenantDb,
} from '@hesabu/db';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ZodType } from 'zod';

import { readApiConfig, type ApiConfig, type Env } from './env.js';
import { InMemoryQueue, type JobQueue } from './queue.js';
import { bearerKey, clientIp, RateLimiter } from './rate-limit.js';
import { emailWebhook } from './routes/email-webhook.js';
import { extractRoute, type Extractor } from './routes/extract.js';
import { whatsappWebhook } from './routes/whatsapp-webhook.js';

import { DeliverBodySchema, GenerateBodySchema, PreferencesSchema, RegisterBodySchema, ReportKindQuerySchema, SendEmailLinkBodySchema } from './schemas.js';
import { toSummary } from './summary.js';

export const API_VERSION = '1.0.0';

/** Bodies larger than this are refused before parsing (M5). */
export const MAX_BODY_BYTES = 1_000_000;
/** Reports can be generated for periods that ended within this many months (M5: bounds the render work). */
export const MAX_REPORT_AGE_MONTHS = 13;
export { InMemoryQueue, PgBossQueue, type JobQueue } from './queue.js';

export interface AppDeps {
  readonly db: Db;
  readonly queue?: JobQueue;
  readonly env?: Env;
  readonly extractor?: Extractor;
  readonly now?: () => Date;
  /** Injected limiter (tests); defaults to a fresh in-memory one per app. */
  readonly limiter?: RateLimiter;
  /** Artefact storage; without it no artefact URLs are minted (null) and the artefact route is 404. */
  readonly storage?: Storage;
}

export interface AppVars {
  tenant: TenantDb;
  deviceId: string;
}

export type ApiApp = Hono<{ Variables: AppVars }>;

export function errorBody(code: string, message: string): { code: string; message: string } {
  return { code, message };
}

/** Parses a JSON body with a Zod schema; a 400 Error on failure (the body is untrusted data). */
export async function parseBody<T>(c: Context, schema: ZodType<T>): Promise<{ ok: true; value: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, res: c.json(errorBody('invalid_json', 'request body must be JSON'), 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join('.') : '';
    return { ok: false, res: c.json(errorBody('invalid', `${where ? where + ': ' : ''}${first?.message ?? 'invalid body'}`), 400) };
  }
  return { ok: true, value: parsed.data };
}

export function createApp(deps: AppDeps): ApiApp {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const config: ApiConfig = readApiConfig(env);
  const queue = deps.queue ?? new InMemoryQueue();
  const now = deps.now ?? (() => new Date());
  const limiter = deps.limiter ?? new RateLimiter(now);
  const storage = deps.storage ?? null;
  const app = new Hono<{ Variables: AppVars }>();

  /**
   * Short-lived artefact URLs (M6): a presigned S3 GET, or, for storage that cannot presign, this API's own signed
   * route. Nothing permanent is ever stored or returned; the same report summary minted twice yields two URLs that
   * both die after 15 minutes.
   */
  const mint = async (key: string | null | undefined): Promise<string | null> => {
    if (!key || !storage || !config.reportLinkSecret || !ARTEFACT_KEY_PATTERN.test(key)) return null;
    const presigned = await storage.signedGetUrl(key, ARTEFACT_URL_TTL_SECONDS);
    if (presigned) return presigned;
    const exp = Math.floor(now().getTime() / 1000) + ARTEFACT_URL_TTL_SECONDS;
    return `${config.apiBaseUrl}/v1/public/artefacts/${signArtefactToken({ key, exp }, config.reportLinkSecret)}`;
  };
  const summaryOf = async (tenant: TenantDb, report: Awaited<ReturnType<TenantDb['getReport']>> & object) =>
    toSummary(report, await tenant.listDeliveries(report.id), mint);

  app.get('/v1/public/artefacts/:token', async (c) => {
    const store = storage;
    const claims = config.reportLinkSecret && store ? verifyArtefactToken(c.req.param('token'), config.reportLinkSecret, now()) : null;
    if (!claims || !store || !ARTEFACT_KEY_PATTERN.test(claims.key)) return c.json(errorBody('not_found', 'expired or unknown'), 404);
    let bytes: Uint8Array;
    try {
      bytes = await store.get(claims.key);
    } catch {
      return c.json(errorBody('not_found', 'expired or unknown'), 404);
    }
    return c.body(Buffer.from(bytes), 200, {
      'content-type': contentTypeFor(claims.key),
      'cache-control': 'private, max-age=600',
      'x-content-type-options': 'nosniff',
    });
  });

  app.use('/v1/*', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json(errorBody('too_large', 'request body exceeds 1 MB'), 413) }));
  app.use('/webhooks/*', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json(errorBody('too_large', 'request body exceeds 1 MB'), 413) }));
  // Tight limits where a request is unauthenticated or expensive (M5).
  app.use('/v1/devices/register', limiter.middleware('register', { windowMs: 60 * 60 * 1000, limit: 20, keyOf: clientIp }));
  app.use('/v1/public/*', limiter.middleware('public', { windowMs: 60 * 1000, limit: 60, keyOf: clientIp }));
  app.use('/r/*', limiter.middleware('public', { windowMs: 60 * 1000, limit: 60, keyOf: clientIp }));
  app.use('/v1/reports/generate', limiter.middleware('generate', { windowMs: 60 * 60 * 1000, limit: 30, keyOf: bearerKey }));
  app.use('/v1/me/email/send-link', limiter.middleware('email-link', { windowMs: 60 * 60 * 1000, limit: 5, keyOf: bearerKey }));
  app.use('/v1/unknown-messages/extract', limiter.middleware('extract', { windowMs: 60 * 60 * 1000, limit: 30, keyOf: bearerKey }));

  app.onError((err, c) => {
    console.error('api error', err.message);
    return c.json(errorBody('internal', 'something went wrong'), 500);
  });

  app.get('/health', async (c) => {
    const dbOk = await db.ping().catch(() => false);
    return c.json(
      { status: dbOk ? 'ok' : 'degraded', service: 'api', version: API_VERSION, timeZone: 'Africa/Nairobi', db: dbOk, time: now().toISOString() },
      dbOk ? 200 : 503,
    );
  });

  // ----- registration (no auth) -----
  app.post('/v1/devices/register', async (c) => {
    if (!config.deviceTokenSecret) return c.json(errorBody('not_configured', 'DEVICE_TOKEN_SECRET is not set'), 503);
    const body = await parseBody(c, RegisterBodySchema);
    if (!body.ok) return body.res;
    let reg;
    try {
      reg = await db.system.registerDevice(body.value);
    } catch (err) {
      if (err instanceof DeviceRevokedError) return c.json(errorBody('device_revoked', 'this device was revoked'), 403);
      throw err;
    }
    // The token names the device row, never the device's secret id; it expires after 30 days (M3, M4).
    const device_token = signDeviceToken({ user_id: reg.user_id, device: reg.device_row_id, iat: Math.floor(now().getTime() / 1000) }, config.deviceTokenSecret);
    return c.json({ device_token, user_id: reg.user_id });
  });

  // ----- device-token auth for everything else under /v1 -----
  app.use('/v1/*', async (c, next) => {
    if (c.req.path === '/v1/devices/register' || c.req.path.startsWith('/v1/public/')) return next();
    if (!config.deviceTokenSecret) return c.json(errorBody('not_configured', 'DEVICE_TOKEN_SECRET is not set'), 503);
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const claims = token ? verifyDeviceToken(token, config.deviceTokenSecret, now()) : null;
    if (!claims) return c.json(errorBody('unauthorized', 'missing, invalid or expired device token'), 401);
    if (!(await db.system.deviceIsActive(claims.device, claims.user_id))) return c.json(errorBody('unauthorized', 'device unknown or revoked'), 401);
    c.set('tenant', db.forUser(claims.user_id));
    c.set('deviceId', claims.device);
    return next();
  });

  // ----- sync -----
  app.post('/v1/sync', async (c) => {
    const body = await parseBody(c, SyncRequestSchema);
    if (!body.ok) return body.res;
    const tenant = c.get('tenant');
    const prefs = await tenant.getPreferences();
    await tenant.upsertAccounts(body.value.accounts);
    const outcome = await tenant.upsertTransactions(body.value.transactions);
    await tenant.audit(`device:${c.get('deviceId')}`, 'sync', {
      accepted: outcome.accepted,
      rejected: outcome.rejected.length,
      accounts: body.value.accounts.length,
      unknown_message_count: body.value.unknown_message_count,
      parser_version: body.value.parser_version,
    });
    const next = nextReportAt(prefs, now());
    return c.json({
      accepted: outcome.accepted,
      rejected: outcome.rejected,
      server_time: now().toISOString(),
      next_report_at: next ? next.toISOString() : null,
    });
  });

  // ----- preferences (plus the join code and which addresses are verified, so the app can show "JOIN <code>") -----
  const prefsView = async (tenant: TenantDb) => {
    const user = await tenant.getUser();
    if (!user) throw new Error('user not found');
    const { email, whatsapp_e164, locale, week_start, weekly_at, monthly_at, channels, theme } = user;
    const [wa, em] = await Promise.all([tenant.hasConsentFor('whatsapp_delivery', whatsapp_e164), tenant.hasConsentFor('email_delivery', email)]);
    return { email, whatsapp_e164, locale, week_start, weekly_at, monthly_at, channels, theme, join_code: user.join_code, whatsapp_verified: wa, email_verified: em };
  };
  app.get('/v1/me/preferences', async (c) => c.json(await prefsView(c.get('tenant'))));
  app.put('/v1/me/preferences', async (c) => {
    const body = await parseBody(c, PreferencesSchema);
    if (!body.ok) return body.res;
    try {
      await c.get('tenant').updatePreferences(body.value);
    } catch (err) {
      if (err instanceof AddressTakenError) return c.json(errorBody('address_taken', 'that WhatsApp number is verified on another account'), 409);
      throw err;
    }
    await c.get('tenant').audit(`device:${c.get('deviceId')}`, 'preferences.updated', { keys: Object.keys(body.value) });
    return c.json(await prefsView(c.get('tenant')));
  });

  // ----- email magic link: the only way email_delivery consent is granted -----
  app.post('/v1/me/email/send-link', async (c) => {
    const body = await parseBody(c, SendEmailLinkBodySchema);
    if (!body.ok) return body.res;
    const tenant = c.get('tenant');
    const prefs = await tenant.getPreferences();
    const email = (body.value.email ?? prefs.email ?? '').trim().toLowerCase();
    if (!email) return c.json(errorBody('invalid', 'no email address to confirm'), 400);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now().getTime() + 60 * 60 * 1000).toISOString();
    await tenant.createEmailConfirmation(email, hashToken(token), expiresAt);
    await queue.enqueueEmailLink({ user_id: tenant.userId, email, link: `${config.appBaseUrl}/confirm-email/${token}`, locale: prefs.locale });
    await tenant.audit(`device:${c.get('deviceId')}`, 'email.link_sent', {});
    return c.json({ sent: true, expires_at: expiresAt }, 202);
  });

  app.get('/v1/public/email/confirm/:token', async (c) => {
    const token = c.req.param('token');
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return c.json(errorBody('not_found', 'expired or unknown'), 404);
    const hit = await db.system.confirmEmailToken(hashToken(token), now());
    if (!hit) return c.json(errorBody('not_found', 'expired or unknown'), 404);
    return c.json({ confirmed: true, email: hit.email });
  });

  // ----- reports -----
  app.get('/v1/reports', async (c) => {
    const kind = ReportKindQuerySchema.safeParse(c.req.query('kind') || undefined);
    if (!kind.success) return c.json(errorBody('invalid', 'kind must be weekly or monthly'), 400);
    const tenant = c.get('tenant');
    const reports = await tenant.listReports(kind.data);
    const out = [];
    for (const r of reports) out.push(await summaryOf(tenant, r));
    return c.json(out);
  });

  app.post('/v1/reports/generate', async (c) => {
    const body = await parseBody(c, GenerateBodySchema);
    if (!body.ok) return body.res;
    const tenant = c.get('tenant');
    const prefs = await tenant.getPreferences();
    let period;
    try {
      period = resolvePeriod(body.value.kind, body.value.period, { weekStart: prefs.week_start, now: now() });
    } catch {
      return c.json(errorBody('invalid', 'period must be last_week, last_month, current or an ISO date'), 400);
    }
    const oldest = new Date(now());
    oldest.setUTCMonth(oldest.getUTCMonth() - MAX_REPORT_AGE_MONTHS);
    if (new Date(period.end).getTime() < oldest.getTime()) {
      return c.json(errorBody('invalid', `reports cover periods that ended within the last ${MAX_REPORT_AGE_MONTHS} months`), 400);
    }
    if (new Date(period.start).getTime() > now().getTime()) {
      return c.json(errorBody('invalid', 'the period has not started yet'), 400);
    }
    let report = await tenant.ensureReport(body.value.kind, period.start, period.end);
    const busy = ['collecting', 'writing', 'checking', 'rendering', 'delivering'].includes(report.status);
    const needsRun = body.value.force || report.status === 'queued' || report.status === 'failed';
    if (body.value.force && !busy && report.status !== 'queued') {
      await tenant.resetReport(report.id);
      report = (await tenant.getReport(report.id)) ?? report;
    }
    if (needsRun && !busy) {
      await queue.enqueueGenerate({ user_id: tenant.userId, report_id: report.id, deliver: body.value.deliver });
      await tenant.audit(`device:${c.get('deviceId')}`, 'report.generate.requested', { kind: body.value.kind, period_start: period.start, force: body.value.force });
    } else if (body.value.deliver && report.status === 'done') {
      const channels = prefs.channels.filter((ch): ch is 'email' | 'whatsapp' => ch === 'email' || ch === 'whatsapp');
      if (channels.length > 0) {
        for (const ch of channels) await tenant.ensureDelivery(report.id, ch);
        await queue.enqueueDeliver({ user_id: tenant.userId, report_id: report.id, channels });
      }
    }
    return c.json(await summaryOf(tenant, report), 202);
  });

  app.get('/v1/reports/:report_id', async (c) => {
    const tenant = c.get('tenant');
    const report = await tenant.getReport(c.req.param('report_id'));
    if (!report) return c.json(errorBody('not_found', 'no such report'), 404);
    return c.json({ summary: await summaryOf(tenant, report), document: report.document_json, facts: report.facts_json });
  });

  app.post('/v1/reports/:report_id/deliver', async (c) => {
    const body = await parseBody(c, DeliverBodySchema);
    if (!body.ok) return body.res;
    const tenant = c.get('tenant');
    const report = await tenant.getReport(c.req.param('report_id'));
    if (!report) return c.json(errorBody('not_found', 'no such report'), 404);
    if (report.status !== 'done') return c.json(errorBody('not_ready', `report is ${report.status}`), 409);
    const channels = [...new Set(body.value.channels)];
    for (const ch of channels) await tenant.ensureDelivery(report.id, ch);
    await queue.enqueueDeliver({ user_id: tenant.userId, report_id: report.id, channels });
    await tenant.audit(`device:${c.get('deviceId')}`, 'report.deliver.requested', { channels });
    return c.json(await summaryOf(tenant, report), 202);
  });

  // ----- unknown-message extraction (consent-gated) -----
  app.route('/', extractRoute(deps.extractor));

  // ----- public signed links -----
  const resolveLink = async (token: string) => {
    if (!config.reportLinkSecret) return null;
    const claims = verifyReportLinkToken(token, config.reportLinkSecret, now());
    if (!claims) return null;
    const link = await db.system.resolveReportLink(hashToken(token), now());
    if (!link || link.report_id !== claims.report_id) return null;
    const report = await db.forUser(link.user_id).getReport(link.report_id);
    return report && report.status === 'done' ? report : null;
  };

  app.get('/v1/public/reports/:token', async (c) => {
    const report = await resolveLink(c.req.param('token'));
    if (!report) return c.json(errorBody('not_found', 'expired or unknown'), 404);
    const [hero_png_url, pdf_url] = await Promise.all([mint(report.artefacts.hero_png_key), mint(report.artefacts.pdf_key)]);
    return c.json({ document: report.document_json, facts: report.facts_json, artefacts: { hero_png_url, pdf_url } });
  });

  app.get('/r/:token', async (c) => {
    const token = c.req.param('token');
    const report = await resolveLink(token);
    if (!report) return c.text('This report link has expired or does not exist.', 404);
    return c.redirect(`${config.appBaseUrl}/r/${encodeURIComponent(token)}`, 302);
  });

  // ----- provider webhooks -----
  app.route('/', whatsappWebhook(db, config, now));
  app.route('/', emailWebhook(db, config, now));

  return app;
}
