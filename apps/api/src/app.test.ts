import { createHmac } from 'node:crypto';

import { signReportLinkToken, hashToken, type Db } from '@hesabu/db';
import { canReachDatabase, openTestDb } from '@hesabu/db/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryStorage } from '@hesabu/db';

import { createApp, type ApiApp } from './app.js';
import { InMemoryQueue } from './queue.js';

const reachable = await canReachDatabase();

const env = {
  DEVICE_TOKEN_SECRET: 'device-secret-for-tests-0123456789',
  REPORT_LINK_SECRET: 'report-link-secret-for-tests-0123456789',
  WHATSAPP_VERIFY_TOKEN: 'verify-me',
  WHATSAPP_APP_SECRET: 'meta-app-secret',
  APP_BASE_URL: 'https://hesabu.test',
};

const FIXED_NOW = new Date('2026-10-12T09:00:00+03:00'); // Monday
const TS = String(Math.floor(FIXED_NOW.getTime() / 1000) - 30); // a Meta event stamped 30 s before "now"

function sampleTransaction(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    account_ref: 'mpesa:07XXXXX123',
    provider: 'mpesa',
    external_ref: null,
    type: 'BUY_GOODS',
    direction: 'out',
    amount_cents: 45_000,
    fee_cents: 0,
    balance_after_cents: 1_000_000,
    occurred_at: '2026-10-06T12:00:00+03:00',
    received_at: '2026-10-06T12:00:05+03:00',
    counterparty: { kind: 'till', name: 'NAIVAS SUPERMARKET', till: '123456' },
    category_id: 'groceries',
    category_source: 'merchant',
    category_confidence: 0.9,
    is_transfer: false,
    transfer_pair_id: null,
    parse_confidence: 0.99,
    source: 'sms',
    raw_hash: id.replaceAll('-', '').padEnd(64, '0').slice(0, 64),
    parser: { pack_id: 'mpesa', pack_version: '1.0.0', family_id: 'buy_goods' },
    user_edited: false,
    note: null,
    tags: [],
    updated_at: '2026-10-06T12:00:05+03:00',
    ...extra,
  };
}

function syncBody(transactions: unknown[]) {
  return {
    device_id: 'dev-1',
    app_version: '1.0.0',
    parser_version: '1.0.0',
    accounts: [{ account_ref: 'mpesa:07XXXXX123', provider: 'mpesa', institution: 'Safaricom', label: 'M-Pesa', mask: '07XXXXX123', last_balance_cents: 1_000_000, last_balance_at: '2026-10-06T12:00:00+03:00' }],
    transactions,
    unknown_message_count: 2,
    sent_at: '2026-10-06T12:01:00+03:00',
  };
}

describe.skipIf(!reachable)('api (Postgres)', () => {
  let db: Db;
  let app: ApiApp;
  let queue: InMemoryQueue;
  const storage = new MemoryStorage();
  let token: string;
  let userId: string;

  const json = (path: string, body: unknown, auth = token, method = 'POST') =>
    app.request(path, { method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) });
  const get = (path: string, auth = token) => app.request(path, { headers: auth ? { authorization: `Bearer ${auth}` } : {} });

  beforeAll(async () => {
    db = await openTestDb();
    queue = new InMemoryQueue();
    app = createApp({ db, queue, env, now: () => FIXED_NOW, storage, extractor: { enabled: true, extract: async (items) => ({ proposals: items.map((_, index) => ({ index, type: 'OTHER' })) }) } });
    const res = await json('/v1/devices/register', { device_id: 'dev-1', platform: 'android', app_version: '1.0.0' }, '');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { device_token: string; user_id: string };
    token = body.device_token;
    userId = body.user_id;
  });
  afterAll(async () => {
    await db?.close();
  });

  it('answers /health with the database state', async () => {
    const res = await get('/health', '');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', db: true, timeZone: 'Africa/Nairobi' });
  });

  it('fails closed on registration and auth without DEVICE_TOKEN_SECRET', async () => {
    const bare = createApp({ db, env: {} });
    const reg = await bare.request('/v1/devices/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device_id: 'x', platform: 'android', app_version: '1' }) });
    expect(reg.status).toBe(503);
    const prefs = await bare.request('/v1/me/preferences', { headers: { authorization: `Bearer ${token}` } });
    expect(prefs.status).toBe(503);
  });

  it('rejects missing, malformed and forged tokens', async () => {
    expect((await get('/v1/me/preferences', '')).status).toBe(401);
    expect((await get('/v1/me/preferences', 'nope')).status).toBe(401);
    const [payload] = token.split('.');
    expect((await get('/v1/me/preferences', `${payload}.forged`)).status).toBe(401);
  });

  it('re-registering the same device returns the same user', async () => {
    const res = await json('/v1/devices/register', { device_id: 'dev-1', platform: 'android', app_version: '1.0.1' }, '');
    expect(((await res.json()) as { user_id: string }).user_id).toBe(userId);
  });

  it('M3/M4: tokens expire, a revoked device is refused, and the token carries no device secret', async () => {
    const reg = (await (await json('/v1/devices/register', { device_id: 'dev-expiring', platform: 'android', app_version: '1.0.0' }, '')).json()) as { device_token: string; user_id: string };
    const payload = JSON.parse(Buffer.from(reg.device_token.split('.')[0]!, 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(payload['device_id']).toBeUndefined();
    expect(String(payload['device'])).not.toContain('dev-expiring');
    expect(typeof payload['exp']).toBe('number');
    expect((await get('/v1/me/preferences', reg.device_token)).status).toBe(200);
    const later = createApp({ db, env, now: () => new Date(FIXED_NOW.getTime() + 31 * 86_400_000) });
    expect((await later.request('/v1/me/preferences', { headers: { authorization: `Bearer ${reg.device_token}` } })).status).toBe(401);
    const row = await db.rawSql<{ id: string }[]>`SELECT id FROM devices WHERE user_id = ${reg.user_id}`;
    await db.system.revokeDevice(row[0]!.id);
    expect((await get('/v1/me/preferences', reg.device_token)).status).toBe(401);
    expect((await json('/v1/devices/register', { device_id: 'dev-expiring', platform: 'android', app_version: '1.0.0' }, '')).status).toBe(403);
    // Audit rows name the device row, never the device's own id.
    const audit = await db.rawSql<{ actor: string }[]>`SELECT actor FROM audit_log WHERE user_id = ${userId} AND actor LIKE 'device:%'`;
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((a) => !a.actor.includes('dev-1'))).toBe(true);
  });

  it('validates the sync body against the contract and upserts idempotently', async () => {
    const bad = await json('/v1/sync', { device_id: 'dev-1' });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { code: string }).code).toBe('invalid');
    const extraField = await json('/v1/sync', { ...syncBody([]), surprise: 1 });
    expect(extraField.status).toBe(400);

    const ok = await json('/v1/sync', syncBody([sampleTransaction('11111111-1111-4111-8111-111111111111'), sampleTransaction('22222222-2222-4222-8222-222222222222', { amount_cents: 12_000 })]));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { accepted: number; rejected: unknown[]; server_time: string; next_report_at: string | null };
    expect(body.accepted).toBe(2);
    expect(body.rejected).toEqual([]);
    expect(body.server_time).toBe(FIXED_NOW.toISOString());
    // Defaults are SUN 19:30 weekly and 1 07:30 monthly; from Monday 12 Oct 09:00 the next is Sunday 18 Oct 19:30 EAT.
    expect(body.next_report_at).toBe('2026-10-18T16:30:00.000Z');

    const again = await json('/v1/sync', syncBody([sampleTransaction('11111111-1111-4111-8111-111111111111')]));
    expect(((await again.json()) as { accepted: number }).accepted).toBe(1);
    expect(await db.forUser(userId).countTransactions()).toBe(2);
  });

  it('reads and updates preferences', async () => {
    expect((await (await get('/v1/me/preferences')).json()) as object).toMatchObject({ locale: 'en', week_start: 'monday', channels: ['share'] });
    const bad = await json('/v1/me/preferences', { locale: 'fr' }, token, 'PUT');
    expect(bad.status).toBe(400);
    const res = await json('/v1/me/preferences', { locale: 'sw', email: 'me@example.test', channels: ['email', 'share'], weekly_at: 'SAT 08:00' }, token, 'PUT');
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toMatchObject({ locale: 'sw', email: 'me@example.test', channels: ['email', 'share'], weekly_at: 'SAT 08:00' });
  });

  it('queues a report once per (kind, period) and regenerates on force', async () => {
    const first = await json('/v1/reports/generate', { kind: 'weekly', period: 'last_week' });
    expect(first.status).toBe(202);
    const s1 = (await first.json()) as { report_id: string; status: string; period_start: string; period_end: string; writer: string };
    expect(s1.status).toBe('queued');
    expect(s1.writer).toBe('pending');
    expect(s1.period_start).toBe('2026-10-04T21:00:00.000Z'); // 5 Oct 00:00 EAT
    expect(s1.period_end).toBe('2026-10-11T21:00:00.000Z');
    expect(queue.generated).toEqual([{ user_id: userId, report_id: s1.report_id, deliver: false }]);

    const second = await json('/v1/reports/generate', { kind: 'weekly', period: '2026-10-07' });
    const s2 = (await second.json()) as { report_id: string };
    expect(s2.report_id).toBe(s1.report_id);
    expect(queue.generated).toHaveLength(2); // still queued, re-enqueue is harmless (singleton key dedupes in pg-boss)

    await db.forUser(userId).updateReport(s1.report_id, { status: 'done', writer: 'fallback', generated_at: FIXED_NOW.toISOString(), document_json: { title: 'x' }, facts_json: { version: '1' } });
    const third = await json('/v1/reports/generate', { kind: 'weekly', period: 'last_week' });
    expect(((await third.json()) as { status: string }).status).toBe('done');
    expect(queue.generated).toHaveLength(2);

    const forced = await json('/v1/reports/generate', { kind: 'weekly', period: 'last_week', force: true, deliver: true });
    expect(((await forced.json()) as { status: string }).status).toBe('queued');
    expect(queue.generated.at(-1)).toEqual({ user_id: userId, report_id: s1.report_id, deliver: true });

    const invalid = await json('/v1/reports/generate', { kind: 'weekly', period: 'yesterday-ish' });
    expect(invalid.status).toBe(400);
  });

  it('lists and fetches reports, and delivers only finished ones', async () => {
    const list = await get('/v1/reports?kind=weekly');
    expect(list.status).toBe(200);
    const items = (await list.json()) as { report_id: string; status: string }[];
    expect(items).toHaveLength(1);
    const id = items[0]!.report_id;
    expect((await get('/v1/reports?kind=daily')).status).toBe(400);

    const notReady = await json(`/v1/reports/${id}/deliver`, { channels: ['email'] });
    expect(notReady.status).toBe(409);

    await db.forUser(userId).updateReport(id, { status: 'done', writer: 'fallback', document_json: { title: 'doc' }, facts_json: { version: '1' } });
    const full = await get(`/v1/reports/${id}`);
    expect(full.status).toBe(200);
    expect((await full.json()) as object).toMatchObject({ summary: { report_id: id, status: 'done' }, document: { title: 'doc' }, facts: { version: '1' } });

    const deliver = await json(`/v1/reports/${id}/deliver`, { channels: ['email', 'whatsapp', 'email'] });
    expect(deliver.status).toBe(202);
    const summary = (await deliver.json()) as { deliveries: { channel: string; status: string }[] };
    expect(summary.deliveries.map((d) => d.channel).sort()).toEqual(['email', 'whatsapp']);
    expect(queue.deliveries.at(-1)).toEqual({ user_id: userId, report_id: id, channels: ['email', 'whatsapp'] });

    expect((await get('/v1/reports/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('gates unknown-message extraction on consent and AI availability', async () => {
    const items = [{ sender: 'MPESA', body_redacted: 'Confirmed. Ksh500 sent to [NAME] 07XXXXX123', received_at: '2026-10-06T12:00:00+03:00' }];
    const noConsent = await json('/v1/unknown-messages/extract', { items });
    expect(noConsent.status).toBe(403);
    await db.forUser(userId).grantConsent('ai_fallback');
    const ok = await json('/v1/unknown-messages/extract', { items });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ proposals: [{ index: 0, type: 'OTHER' }] });
    const tooMany = await json('/v1/unknown-messages/extract', { items: Array.from({ length: 21 }, () => items[0]) });
    expect(tooMany.status).toBe(400);
    const offApp = createApp({ db, env, now: () => FIXED_NOW });
    const off = await offApp.request('/v1/unknown-messages/extract', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ items }) });
    expect(off.status).toBe(503);
  });

  it('resolves signed public links until they expire or are revoked', async () => {
    const tenant = db.forUser(userId);
    const report = (await tenant.listReports('weekly'))[0]!;
    const exp = Math.floor(FIXED_NOW.getTime() / 1000) + 3600;
    const live = signReportLinkToken({ report_id: report.id, exp }, env.REPORT_LINK_SECRET);
    await tenant.createReportLink(report.id, hashToken(live), new Date(exp * 1000).toISOString());
    const res = await get(`/v1/public/reports/${live}`, '');
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toMatchObject({ document: { title: 'doc' }, facts: { version: '1' }, artefacts: { hero_png_url: null, pdf_url: null } });
    const redirect = await get(`/r/${live}`, '');
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe(`https://hesabu.test/r/${encodeURIComponent(live)}`);

    const unknownHash = signReportLinkToken({ report_id: report.id, exp }, env.REPORT_LINK_SECRET + 'x');
    expect((await get(`/v1/public/reports/${unknownHash}`, '')).status).toBe(404);
    const notStored = signReportLinkToken({ report_id: report.id, exp: exp + 1 }, env.REPORT_LINK_SECRET);
    expect((await get(`/v1/public/reports/${notStored}`, '')).status).toBe(404);
    expect((await get('/r/garbage', '')).status).toBe(404);
    const noSecret = createApp({ db, env: { ...env, REPORT_LINK_SECRET: '' }, now: () => FIXED_NOW });
    expect((await noSecret.request(`/v1/public/reports/${live}`)).status).toBe(404);
  });

  it('handles the WhatsApp verification handshake and status webhooks', async () => {
    const ok = await get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345', '');
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('12345');
    expect((await get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1', '')).status).toBe(403);

    const tenant = db.forUser(userId);
    await tenant.updatePreferences({ whatsapp_e164: '+254700000123' });
    const report = (await tenant.listReports('weekly'))[0]!;
    const delivery = await tenant.ensureDelivery(report.id, 'whatsapp');
    await tenant.updateDelivery(delivery.id, { status: 'sent', provider_message_id: 'wamid.ABC' });

    const payload = JSON.stringify({
      entry: [{ changes: [{ value: {
        statuses: [{ id: 'wamid.ABC', status: 'delivered', timestamp: TS }, { id: 'wamid.unknown', status: 'read', timestamp: TS }],
        messages: [{ from: '254700000123', type: 'text', timestamp: TS, text: { body: 'STOP' } }],
      } }] }],
    });
    const unsigned = await app.request('/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
    expect(unsigned.status).toBe(401);
    const sig = 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(payload).digest('hex');
    const signed = await app.request('/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: payload });
    expect(signed.status).toBe(200);
    expect(await signed.json()).toEqual({ ok: true, statuses: 1, commands: 1, stale: 0 });
    expect((await tenant.listDeliveries(report.id)).find((d) => d.channel === 'whatsapp')?.status).toBe('delivered');
    expect(await tenant.hasConsent('whatsapp_delivery')).toBe(false);
  });

  it('M1: webhooks fail closed in production without their secrets, and old Meta events are ignored', async () => {
    const prod = createApp({ db, env: { ...env, WHATSAPP_APP_SECRET: '', RESEND_WEBHOOK_SECRET: '', NODE_ENV: 'production' }, now: () => FIXED_NOW });
    expect((await prod.request('/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(503);
    expect((await prod.request('/webhooks/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(503);
    const dev = createApp({ db, env: { ...env, WHATSAPP_APP_SECRET: '', RESEND_WEBHOOK_SECRET: '' }, now: () => FIXED_NOW });
    expect((await dev.request('/webhooks/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(200);
    // Replay: a status event stamped ten minutes ago changes nothing.
    const tenant = db.forUser(userId);
    const report = (await tenant.listReports('weekly'))[0]!;
    const delivery = await tenant.ensureDelivery(report.id, 'whatsapp');
    await tenant.updateDelivery(delivery.id, { status: 'sent', provider_message_id: 'wamid.OLD' });
    const old = String(Math.floor(FIXED_NOW.getTime() / 1000) - 600);
    const payload = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.OLD', status: 'failed', timestamp: old, errors: [{ code: 131026, title: 'free text <script>' }] }] } }] }] });
    const sig = 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(payload).digest('hex');
    const res = await app.request('/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: payload });
    expect(await res.json()).toEqual({ ok: true, statuses: 0, commands: 0, stale: 1 });
    expect((await tenant.listDeliveries(report.id)).find((d) => d.channel === 'whatsapp')?.status).toBe('sent');
    // A fresh failure stores only an error code, never the provider's text.
    const fresh = payload.replace(old, TS);
    const sig2 = 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(fresh).digest('hex');
    await app.request('/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig2 }, body: fresh });
    expect((await tenant.listDeliveries(report.id)).find((d) => d.channel === 'whatsapp')).toMatchObject({ status: 'failed', last_error: 'whatsapp_error_131026' });
  });

  it('B1/M2: JOIN needs the user’s code, proves the sender’s number, and a changed number loses the consent', async () => {
    const tenant = db.forUser(userId);
    const prefs = (await (await get('/v1/me/preferences')).json()) as { join_code: string; whatsapp_verified: boolean };
    expect(prefs.join_code).toMatch(/^[A-F0-9]{8}$/);
    expect(prefs.whatsapp_verified).toBe(false);
    const send = async (from: string, body: string) => {
      const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, type: 'text', timestamp: TS, text: { body } }] } }] }] });
      const sig = 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(payload).digest('hex');
      return (await (await app.request('/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: payload })).json()) as { commands: number };
    };
    // A bare JOIN, or a JOIN with someone else's code, proves nothing.
    expect((await send('254711111111', 'JOIN')).commands).toBe(0);
    expect((await send('254711111111', 'JOIN NOTACODE1')).commands).toBe(0);
    expect(await tenant.hasConsentFor('whatsapp_delivery', '+254711111111')).toBe(false);
    // The real code from the real phone binds that number and grants consent for exactly it.
    expect((await send('254711111111', `join ${prefs.join_code.toLowerCase()}`)).commands).toBe(1);
    const after = (await (await get('/v1/me/preferences')).json()) as { whatsapp_e164: string; whatsapp_verified: boolean };
    expect(after).toMatchObject({ whatsapp_e164: '+254711111111', whatsapp_verified: true });
    expect(await tenant.hasConsentFor('whatsapp_delivery', '+254711111111')).toBe(true);
    expect(await tenant.hasConsentFor('whatsapp_delivery', '+254799999999')).toBe(false);
    // The exploit: pointing the number at a victim after consent. The consent dies with the change.
    const moved = await json('/v1/me/preferences', { whatsapp_e164: '+254799999999' }, token, 'PUT');
    expect(((await moved.json()) as { whatsapp_verified: boolean }).whatsapp_verified).toBe(false);
    expect(await tenant.hasConsentFor('whatsapp_delivery', '+254799999999')).toBe(false);
    expect(await tenant.hasConsent('whatsapp_delivery')).toBe(false);
    // A second account cannot type a number that is verified elsewhere; a JOIN from it moves the number instead.
    const other = (await (await json('/v1/devices/register', { device_id: 'dev-other', platform: 'android', app_version: '1.0.0' }, '')).json()) as { device_token: string; user_id: string };
    expect((await send('254711111111', `JOIN ${prefs.join_code}`)).commands).toBe(1); // back on the first account
    const taken = await json('/v1/me/preferences', { whatsapp_e164: '+254711111111' }, other.device_token, 'PUT');
    expect(taken.status).toBe(409);
    const otherPrefs = (await (await get('/v1/me/preferences', other.device_token)).json()) as { join_code: string };
    expect((await send('254711111111', `JOIN ${otherPrefs.join_code}`)).commands).toBe(1);
    expect(await db.forUser(other.user_id).hasConsentFor('whatsapp_delivery', '+254711111111')).toBe(true);
    expect((await tenant.getPreferences()).whatsapp_e164).toBeNull();
    expect(await tenant.hasConsent('whatsapp_delivery')).toBe(false);
  });

  it('B1: email consent comes only from the magic link and is bound to that address', async () => {
    const tenant = db.forUser(userId);
    await json('/v1/me/preferences', { email: 'owner@example.test' }, token, 'PUT');
    expect(await tenant.hasConsentFor('email_delivery', 'owner@example.test')).toBe(false);
    const sent = await json('/v1/me/email/send-link', {});
    expect(sent.status).toBe(202);
    const job = queue.emailLinks.at(-1)!;
    expect(job).toMatchObject({ user_id: userId, email: 'owner@example.test' });
    const linkToken = job.link.split('/confirm-email/')[1]!;
    expect((await get('/v1/public/email/confirm/not-a-real-token-at-all-0000000000', '')).status).toBe(404);
    const confirm = await get(`/v1/public/email/confirm/${linkToken}`, '');
    expect(confirm.status).toBe(200);
    expect(await confirm.json()).toEqual({ confirmed: true, email: 'owner@example.test' });
    expect((await get(`/v1/public/email/confirm/${linkToken}`, '')).status).toBe(404); // single use
    expect(await tenant.hasConsentFor('email_delivery', 'Owner@Example.test')).toBe(true);
    expect(((await (await get('/v1/me/preferences')).json()) as { email_verified: boolean }).email_verified).toBe(true);
    await json('/v1/me/preferences', { email: 'victim@example.test' }, token, 'PUT');
    expect(await tenant.hasConsentFor('email_delivery', 'victim@example.test')).toBe(false);
    expect(await tenant.hasConsent('email_delivery')).toBe(false);
    // Granting a delivery consent without an address is refused outright.
    await expect(tenant.grantConsent('email_delivery')).rejects.toThrow(/proven address/);
  });

  it('maps email provider events onto deliveries', async () => {
    const tenant = db.forUser(userId);
    const report = (await tenant.listReports('weekly'))[0]!;
    const delivery = await tenant.ensureDelivery(report.id, 'email');
    await tenant.updateDelivery(delivery.id, { status: 'sent', provider_message_id: 'email-1' });
    await tenant.grantConsent('email_delivery', '1', 'me@example.test');
    const res = await app.request('/webhooks/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'email-1', bounce: { message: 'mailbox full' } } }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, handled: true });
    const d = (await tenant.listDeliveries(report.id)).find((x) => x.channel === 'email');
    expect(d?.status).toBe('failed');
    expect(d?.last_error).toBe('bounced');
    expect(await tenant.hasConsent('email_delivery')).toBe(false);
    const miss = await app.request('/webhooks/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'nope' } }) });
    expect(await miss.json()).toEqual({ ok: true, handled: false });
  });

  it('M6: artefact URLs are minted per request, expire in 15 minutes and never leak a permanent location', async () => {
    const tenant = db.forUser(userId);
    const report = (await tenant.listReports('weekly'))[0]!;
    const heroKey = `reports/${userId}/${report.id}/hero.png`;
    const pdfKey = `reports/${userId}/${report.id}/report.pdf`;
    await storage.put(heroKey, new Uint8Array([137, 80, 78, 71]), 'image/png');
    await storage.put(pdfKey, new TextEncoder().encode('%PDF-1.4 demo'), 'application/pdf');
    await tenant.updateReport(report.id, { artefacts: { ...report.artefacts, hero_png_key: heroKey, pdf_key: pdfKey } });
    const summary = (await (await get(`/v1/reports/${report.id}`)).json()) as { summary: { artefacts: { hero_png_url: string; pdf_url: string } } };
    const heroUrl = summary.summary.artefacts.hero_png_url;
    expect(heroUrl).toMatch(/^http:\/\/localhost:8787\/v1\/public\/artefacts\//);
    expect(heroUrl).not.toContain(heroKey);
    const path = heroUrl.replace('http://localhost:8787', '');
    const served = await app.request(path);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect((await app.request(path.slice(0, -2) + 'xx')).status).toBe(404);
    const later = createApp({ db, env, storage, now: () => new Date(FIXED_NOW.getTime() + 16 * 60 * 1000) });
    expect((await later.request(path)).status).toBe(404);
    // The public resolver mints the same way, and the stored row holds keys only.
    const stored = await tenant.getReport(report.id);
    expect(JSON.stringify(stored?.artefacts)).not.toContain('http');
    const noStorage = createApp({ db, env, now: () => FIXED_NOW });
    const bare = (await (await noStorage.request(`/v1/reports/${report.id}`, { headers: { authorization: `Bearer ${token}` } })).json()) as { summary: { artefacts: { hero_png_url: string | null } } };
    expect(bare.summary.artefacts.hero_png_url).toBeNull();
  });

  it('M5: bounds body size, string lengths, report age and request rates', async () => {
    const big = JSON.stringify({ ...syncBody([]), parser_version: 'x'.repeat(1_100_000) });
    expect((await app.request('/v1/sync', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: big })).status).toBe(413);
    const longString = await json('/v1/sync', syncBody([sampleTransaction('77777777-7777-4777-8777-777777777777', { account_ref: 'a'.repeat(81) })]));
    expect(longString.status).toBe(400);
    const ancient = await json('/v1/reports/generate', { kind: 'monthly', period: '2024-01-15' });
    expect(ancient.status).toBe(400);
    expect(((await ancient.json()) as { message: string }).message).toContain('13 months');
    const future = await json('/v1/reports/generate', { kind: 'weekly', period: '2027-06-01' });
    expect(future.status).toBe(400);
    // Registration: 20 per IP per hour, then 429 with retry-after.
    const fresh = createApp({ db, env, now: () => FIXED_NOW });
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      const r = await fresh.request('/v1/devices/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify({ device_id: `burst-${i}`, platform: 'android', app_version: '1' }) });
      last = r.status;
      if (r.status === 429) expect(r.headers.get('retry-after')).toMatch(/^\d+$/);
    }
    expect(last).toBe(429);
    const otherIp = await fresh.request('/v1/devices/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' }, body: JSON.stringify({ device_id: 'burst-x', platform: 'android', app_version: '1' }) });
    expect(otherIp.status).toBe(200);
    // Public resolver: 60 per IP per minute.
    for (let i = 0; i < 60; i += 1) await fresh.request('/v1/public/reports/nope', { headers: { 'x-forwarded-for': '198.51.100.1' } });
    expect((await fresh.request('/v1/public/reports/nope', { headers: { 'x-forwarded-for': '198.51.100.1' } })).status).toBe(429);
  });

  it('404s unknown routes', async () => {
    expect((await get('/nope', '')).status).toBe(404);
  });
});
