/**
 * End to end against Postgres: demo ledger → POST /v1/reports/generate (in-process API) → workflow with the
 * numbers-only fallback writer → stub renderer → fake storage → fake deliveries. This is the path CI proves.
 */
import { FactsSheetSchema } from '@hesabu/analytics';
import { FakeModelClient, readAiConfig, ReportDocumentSchema } from '@hesabu/agents';
import { createApp, InMemoryQueue } from '@hesabu/api';
import { hashToken, parseDemoInbox, type Db, type ReportDeliverJob } from '@hesabu/db';
import { canReachDatabase, openTestDb } from '@hesabu/db/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeEmailSender } from './adapters/email.js';
import { PackageRenderer, StubRenderer } from './adapters/renderer.js';
import { MemoryStorage } from './adapters/storage.js';
import { FakeWhatsAppSender } from './adapters/whatsapp.js';
import { runDeliveryJob } from './deliver.js';
import { schedulerTick } from './scheduler.js';
import { collectionWindow, runReportJob, type WorkflowDeps } from './workflow.js';

const reachable = await canReachDatabase();
const NOW = new Date('2026-10-12T09:00:00+03:00'); // Monday after the demo inbox's last week (5–11 Oct 2026)
const inbox = parseDemoInbox();
const browser = await import('@hesabu/renderer').then((m) => m.browserAvailable()).catch(() => false);
const env = { DEVICE_TOKEN_SECRET: 'device-secret-for-tests-0123456789', REPORT_LINK_SECRET: 'report-link-secret-for-tests-0123456789', APP_BASE_URL: 'https://hesabu.test' };

describe.skipIf(!reachable)('report workflow (Postgres, fallback writer, fakes)', () => {
  let db: Db;
  let userId: string;
  let token: string;
  let queue: InMemoryQueue;
  let app: ReturnType<typeof createApp>;
  const storage = new MemoryStorage();
  const email = new FakeEmailSender();
  const whatsapp = new FakeWhatsAppSender();
  const deliverJobs: ReportDeliverJob[] = [];
  let deps: WorkflowDeps;

  const post = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

  beforeAll(async () => {
    db = await openTestDb();
    queue = new InMemoryQueue();
    app = createApp({ db, queue, env, now: () => NOW });
    const reg = await app.request('/v1/devices/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device_id: 'demo', platform: 'android', app_version: '1.0.0' }) });
    const body = (await reg.json()) as { device_token: string; user_id: string };
    token = body.device_token;
    userId = body.user_id;
    const tenant = db.forUser(userId);
    await tenant.upsertCategories(inbox.categories);
    await tenant.updatePreferences({ email: 'demo@example.test', whatsapp_e164: '+254700000321', channels: ['email', 'whatsapp'], locale: 'en' });
    await tenant.grantConsent('email_delivery');
    await tenant.grantConsent('whatsapp_delivery');
    await tenant.upsertBudget({ category_id: 'food_groceries', period: 'weekly', limit_cents: 600_000 });
    const sync = await post('/v1/sync', { device_id: 'demo', app_version: '1.0.0', parser_version: '1.0.0', accounts: inbox.accounts, transactions: inbox.transactions, unknown_message_count: 3, sent_at: NOW.toISOString() });
    expect(sync.status).toBe(200);
    const synced = (await sync.json()) as { accepted: number; rejected: unknown[] };
    expect(synced.rejected).toEqual([]);
    expect(synced.accepted).toBe(inbox.transactions.length);
    deps = {
      db, renderer: new StubRenderer(), storage, ai: readAiConfig({ AI_ENABLED: 'false' }), clientFactory: () => new FakeModelClient([]),
      appBaseUrl: 'https://hesabu.test', reportLinkSecret: env.REPORT_LINK_SECRET, reportLinkTtlDays: 30,
      enqueueDeliver: async (job) => { deliverJobs.push(job); }, now: () => NOW,
    };
  });
  afterAll(async () => {
    await db?.close();
  });

  it('computes the collection window from six months back or January', () => {
    expect(collectionWindow({ kind: 'week', start: '2026-10-05T00:00:00+03:00', end: '2026-10-12T00:00:00+03:00', label_en: '', label_sw: '', days: 7, days_elapsed: 7, timezone: 'Africa/Nairobi' })).toEqual({ from: '2026-01-01T00:00:00+03:00', to: '2026-10-12T00:00:00+03:00' });
    expect(collectionWindow({ kind: 'month', start: '2026-03-01T00:00:00+03:00', end: '2026-04-01T00:00:00+03:00', label_en: '', label_sw: '', days: 31, days_elapsed: 31, timezone: 'Africa/Nairobi' })).toEqual({ from: '2025-09-01T00:00:00+03:00', to: '2026-04-01T00:00:00+03:00' });
  });

  it.each(['last_week', 'last_month'] as const)('generates %s with the fallback writer and queues deliveries', async (period) => {
    const kind = period === 'last_week' ? 'weekly' : 'monthly';
    const res = await post('/v1/reports/generate', { kind, period, deliver: true });
    expect(res.status).toBe(202);
    const summary = (await res.json()) as { report_id: string; status: string };
    expect(summary.status).toBe('queued');
    const job = queue.generated.find((j) => j.report_id === summary.report_id)!;
    expect(job).toBeDefined();

    const result = await runReportJob(deps, job);
    expect(result).not.toBeNull();
    expect(result!.writer).toBe('fallback');
    expect(result!.report.status).toBe('done');
    expect(FactsSheetSchema.safeParse(result!.facts).success).toBe(true);
    expect(ReportDocumentSchema.safeParse(result!.document).success).toBe(true);
    expect(result!.document.meta.fact_check.passed).toBe(true);
    expect(result!.document.kind).toBe(kind);
    expect(result!.facts.totals.out.cents).toBeGreaterThan(0);
    expect(result!.facts.candidate_insights.length).toBeGreaterThan(3);
    expect(result!.deliveriesQueued).toEqual(['email', 'whatsapp']);
    expect(result!.report.artefacts.hero_png_url).toMatch(/hero\.png$/);
    expect(result!.report.artefacts.pdf_url).toMatch(/report\.pdf$/);
    expect(result!.report.artefacts.web_url).toMatch(/^https:\/\/hesabu\.test\/r\//);
    expect(result!.report.cost_usd).toBe(0);

    // The signed link resolves through the public API.
    const linkToken = result!.report.artefacts.web_url!.split('/r/')[1]!;
    expect((await db.system.resolveReportLink(hashToken(linkToken), NOW))?.report_id).toBe(job.report_id);
    const pub = await app.request(`/v1/public/reports/${linkToken}`);
    expect(pub.status).toBe(200);
    expect(((await pub.json()) as { document: { title: string } }).document.title).toBe(result!.document.title);

    // Insights were stored, candidate and selected flags alike.
    const full = await app.request(`/v1/reports/${job.report_id}`, { headers: { authorization: `Bearer ${token}` } });
    expect(((await full.json()) as { summary: { status: string; writer: string } }).summary).toMatchObject({ status: 'done', writer: 'fallback' });
  });

  it('is idempotent: a second run of a done report does nothing', async () => {
    const job = queue.generated[0]!;
    const before = await db.forUser(userId).getReport(job.report_id);
    expect(await runReportJob(deps, { ...job, deliver: false })).toBeNull();
    expect((await db.forUser(userId).getReport(job.report_id))?.generated_at).toBe(before?.generated_at);
  });

  it('delivers once per channel through the fakes and skips without consent', async () => {
    const job = deliverJobs[0]!;
    const outcomes = await runDeliveryJob({ db, storage, email, whatsapp }, job);
    expect(outcomes.map((o) => [o.channel, o.status])).toEqual([['email', 'sent'], ['whatsapp', 'sent']]);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.to).toBe('demo@example.test');
    expect(email.sent[0]!.html).toContain('cid:hero');
    expect(email.sent[0]!.attachments.some((a) => a.contentType === 'application/pdf')).toBe(true);
    expect(email.sent[0]!.attachments.some((a) => a.contentId === 'hero')).toBe(true);
    expect(whatsapp.calls.map((c) => c.kind)).toEqual(['upload', 'image', 'upload', 'document']);
    expect(whatsapp.calls[1]!.caption!.length).toBeLessThanOrEqual(1000);

    const again = await runDeliveryJob({ db, storage, email, whatsapp }, job);
    expect(again.map((o) => o.status)).toEqual(['already', 'already']);
    expect(email.sent).toHaveLength(1);

    const deliveries = await db.forUser(userId).listDeliveries(job.report_id);
    expect(deliveries.map((d) => [d.channel, d.status, d.attempts])).toEqual([['email', 'sent', 1], ['whatsapp', 'sent', 1]]);
    expect(deliveries.every((d) => d.provider_message_id)).toBe(true);

    await db.forUser(userId).revokeConsent('whatsapp_delivery');
    const second = deliverJobs[1]!;
    const skipped = await runDeliveryJob({ db, storage, email, whatsapp }, second);
    expect(skipped.find((o) => o.channel === 'whatsapp')?.status).toBe('skipped');
    const noProvider = await runDeliveryJob({ db, storage, email: null, whatsapp: null }, { ...second, channels: ['email'] });
    expect(noProvider[0]).toMatchObject({ channel: 'email', status: 'already' }); // email for report 2 was sent just above
  });

  it('regenerates on force and marks failures', async () => {
    const res = await post('/v1/reports/generate', { kind: 'weekly', period: 'last_week', force: true });
    const summary = (await res.json()) as { report_id: string; status: string };
    expect(summary.status).toBe('queued');
    const result = await runReportJob(deps, { user_id: userId, report_id: summary.report_id, deliver: false });
    expect(result?.report.status).toBe('done');

    await db.forUser(userId).resetReport(summary.report_id);
    const broken = { ...deps, renderer: { name: 'broken', render: async () => { throw new Error('renderer exploded'); } } };
    await expect(runReportJob(broken, { user_id: userId, report_id: summary.report_id, deliver: false })).rejects.toThrow(/exploded/);
    const failed = await db.forUser(userId).getReport(summary.report_id);
    expect(failed?.status).toBe('failed');
    expect(failed?.last_error).toContain('renderer exploded');
  });

  it.skipIf(!browser)('renders through the real @hesabu/renderer (Playwright) in light and dark', async () => {
    const renderer = new PackageRenderer();
    try {
      const tenant = db.forUser(userId);
      for (const theme of ['light', 'dark'] as const) {
        await tenant.updatePreferences({ theme });
        const res = await post('/v1/reports/generate', { kind: 'weekly', period: '2026-10-07', force: true });
        const summary = (await res.json()) as { report_id: string };
        const result = await runReportJob({ ...deps, renderer }, { user_id: userId, report_id: summary.report_id, deliver: false });
        expect(result?.report.status).toBe('done');
        const hero = await storage.get(result!.report.artefacts.hero_png_key!);
        expect(hero.byteLength).toBeGreaterThan(5_000); // a real 1080×1350 screenshot, not the 1×1 stub
        const pdf = await storage.get(result!.report.artefacts.pdf_key!);
        expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
        expect(pdf.byteLength).toBeGreaterThan(10_000);
        expect(Object.keys(result!.report.artefacts.chart_keys ?? {}).length).toBeGreaterThan(3);
        const html = new TextDecoder().decode(await storage.get(result!.report.artefacts.html_key!));
        expect(html).toContain(result!.document.title);
      }
    } finally {
      await renderer.close();
    }
  });

  it('scheduler tick queues the due weekly report after the Sunday slot', async () => {
    const enqueued: { report_id: string }[] = [];
    const sunday = new Date('2026-10-11T19:40:00+03:00');
    const r1 = await schedulerTick({ db, enqueue: async (job) => { enqueued.push(job); }, now: () => sunday });
    expect(r1.due).toBe(1);
    expect(r1.enqueued).toBe(0); // the week 5–11 Oct already has a report row that is not queued
    await db.forUser(userId).updatePreferences({ weekly_at: 'SAT 20:00' });
    const sat = new Date('2026-10-03T20:05:00+03:00');
    const r2 = await schedulerTick({ db, enqueue: async (job) => { enqueued.push(job); }, now: () => sat });
    expect(r2.enqueued).toBe(1);
    const r3 = await schedulerTick({ db, enqueue: async (job) => { enqueued.push(job); }, now: () => sat });
    expect(r3.enqueued).toBe(1); // still queued: re-enqueue is idempotent via the singleton key
    expect(new Set(enqueued.map((e) => e.report_id)).size).toBe(1);
  });
});
