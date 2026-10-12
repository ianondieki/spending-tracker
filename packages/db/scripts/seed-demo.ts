/**
 * `pnpm --filter @hesabu/db seed:demo`: loads the demo ledger into a demo user, then asks the API to generate
 * last week's and last month's reports with delivery and waits for the worker to finish them.
 * Needs DATABASE_URL and DEVICE_TOKEN_SECRET; API_URL defaults to http://localhost:8787. When the API is not
 * running the script seeds and prints the curl commands instead.
 */
import { Db, DEMO_CATEGORIES, demoAccounts, demoInboxAvailable, demoTransactions, parseDemoInbox, signDeviceToken } from '../src/index.ts';

const apiUrl = (process.env['API_URL'] ?? 'http://localhost:8787').replace(/\/$/, '');
const secret = process.env['DEVICE_TOKEN_SECRET'];
if (!secret) throw new Error('DEVICE_TOKEN_SECRET is required to mint the demo device token (fail closed)');

const db = await Db.open(process.env);
const now = new Date();
const reg = await db.system.registerDevice({ device_id: 'demo-device', platform: 'android', app_version: '1.0.0', display_name: 'Demo' });
const tenant = db.forUser(reg.user_id);
// The demo ledger: corpus/demo/demo-inbox.jsonl through @hesabu/pack-engine (the inline sample only when the corpus is absent).
const inbox = demoInboxAvailable() ? parseDemoInbox() : null;
if (inbox) console.log(`demo inbox: ${inbox.stats.messages} messages, ${inbox.stats.parsed} parsed, ${inbox.stats.duplicates} duplicate dropped, ${inbox.stats.transfer_pairs} transfer pairs, ${inbox.stats.balance_breaks} balance breaks`);
else console.warn('corpus/demo/demo-inbox.jsonl not found; seeding the inline sample ledger instead');
await tenant.upsertCategories(inbox ? inbox.categories : [...DEMO_CATEGORIES]);
await tenant.updatePreferences({
  email: process.env['REPORT_TO_EMAIL'] || 'demo@example.test',
  whatsapp_e164: process.env['REPORT_TO_WHATSAPP'] || '+254700000321',
  channels: ['email', 'whatsapp', 'share'],
  locale: 'en',
});
await tenant.grantConsent('sync');
await tenant.grantConsent('email_delivery');
await tenant.grantConsent('whatsapp_delivery');
await tenant.upsertBudget({ category_id: inbox ? 'food_groceries' : 'groceries', period: 'weekly', limit_cents: 600_000 });
await tenant.upsertBudget({ category_id: inbox ? 'transport' : 'eating_out', period: 'monthly', limit_cents: 800_000 });
await tenant.upsertAccounts(inbox ? inbox.accounts : demoAccounts(now));
if (process.env['RESEED'] === '1') console.log(`RESEED=1: removed ${await tenant.deleteAllTransactions()} existing transactions`);
const outcome = await tenant.upsertTransactions(inbox ? inbox.transactions : demoTransactions(now));
await tenant.audit('system', 'seed.demo', { accepted: outcome.accepted, rejected: outcome.rejected.length });
console.log(`demo user ${reg.user_id}${reg.created_user ? ' (new)' : ''}: ${outcome.accepted} transactions, ${outcome.rejected.length} rejected`);
await db.close();

const token = signDeviceToken({ user_id: reg.user_id, device_id: 'demo-device', iat: Math.floor(now.getTime() / 1000) }, secret);
const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

const apiUp = await fetch(`${apiUrl}/health`).then((r) => r.ok).catch(() => false);
if (!apiUp) {
  console.log(`API not reachable at ${apiUrl}. Start it (pnpm dev:api) and the worker (pnpm dev:worker), then:`);
  for (const [kind, period] of inbox ? [['weekly', '2026-10-07'], ['monthly', '2026-09-15']] : [['weekly', 'last_week'], ['monthly', 'last_month']]) {
    console.log(`curl -s -X POST ${apiUrl}/v1/reports/generate -H 'authorization: Bearer ${token}' -H 'content-type: application/json' -d '{"kind":"${kind}","period":"${period}","deliver":true}'`);
  }
  process.exit(0);
}

const ids: string[] = [];
// The demo inbox ends on Sunday 11 October 2026; "last_week"/"last_month" are relative to the clock, so an explicit
// date inside the demo range is used when the inbox is seeded (override with PERIOD_WEEK / PERIOD_MONTH).
const periods: [string, string][] = inbox
  ? [['weekly', process.env['PERIOD_WEEK'] ?? '2026-10-07'], ['monthly', process.env['PERIOD_MONTH'] ?? '2026-09-15']]
  : [['weekly', 'last_week'], ['monthly', 'last_month']];
for (const [kind, period] of periods) {
  const res = await fetch(`${apiUrl}/v1/reports/generate`, { method: 'POST', headers, body: JSON.stringify({ kind, period, deliver: true, force: process.env['FORCE'] === '1' }) });
  const body = (await res.json()) as { report_id: string; status: string };
  console.log(`${kind} ${period}: ${res.status} ${body.status} ${body.report_id}`);
  ids.push(body.report_id);
}
const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  const states = await Promise.all(ids.map(async (id) => (await (await fetch(`${apiUrl}/v1/reports/${id}`, { headers })).json()) as { summary: { status: string; writer: string; artefacts: { web_url: string | null }; deliveries: { channel: string; status: string }[] } }));
  const line = states.map((s) => `${s.summary.status}/${s.summary.writer} [${s.summary.deliveries.map((d) => `${d.channel}:${d.status}`).join(' ') || 'no deliveries'}]`).join(' | ');
  console.log(line);
  if (states.every((s) => s.summary.status === 'done' || s.summary.status === 'failed')) {
    for (const s of states) if (s.summary.artefacts.web_url) console.log(`web: ${s.summary.artefacts.web_url}`);
    process.exit(states.every((s) => s.summary.status === 'done') ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
console.error('timed out waiting for the worker');
process.exit(1);
