import { nextReportAt, resolvePeriod, SyncRequestSchema } from '@hesabu/analytics';
import { randomBytes } from 'node:crypto';

import { AddressTakenError, DeviceRevokedError, hashToken, signDeviceToken, verifyDeviceToken, verifyReportLinkToken, type Db, type TenantDb } from '@hesabu/db';
import { Hono, type Context } from 'hono';
import type { ZodType } from 'zod';

import { readApiConfig, type ApiConfig, type Env } from './env.js';
import { InMemoryQueue, type JobQueue } from './queue.js';
import { emailWebhook } from './routes/email-webhook.js';
import { extractRoute, type Extractor } from './routes/extract.js';
import { whatsappWebhook } from './routes/whatsapp-webhook.js';

import { DeliverBodySchema, GenerateBodySchema, PreferencesSchema, RegisterBodySchema, ReportKindQuerySchema, SendEmailLinkBodySchema } from './schemas.js';
import { toSummary } from './summary.js';

export const API_VERSION = '1.0.0';
export { InMemoryQueue, PgBossQueue, type JobQueue } from './queue.js';

export interface AppDeps {
  readonly db: Db;
  readonly queue?: JobQueue;
  readonly env?: Env;
  readonly extractor?: Extractor;
  readonly now?: () => Date;
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
  const app = new Hono<{ Variables: AppVars }>();

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
    for (const r of reports) out.push(toSummary(r, await tenant.listDeliveries(r.id)));
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
    return c.json(toSummary(report, await tenant.listDeliveries(report.id)), 202);
  });

  app.get('/v1/reports/:report_id', async (c) => {
    const tenant = c.get('tenant');
    const report = await tenant.getReport(c.req.param('report_id'));
    if (!report) return c.json(errorBody('not_found', 'no such report'), 404);
    return c.json({ summary: toSummary(report, await tenant.listDeliveries(report.id)), document: report.document_json, facts: report.facts_json });
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
    return c.json(toSummary(report, await tenant.listDeliveries(report.id)), 202);
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
    return c.json({
      document: report.document_json,
      facts: report.facts_json,
      artefacts: { hero_png_url: report.artefacts.hero_png_url ?? null, pdf_url: report.artefacts.pdf_url ?? null },
    });
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
