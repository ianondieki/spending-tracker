/**
 * The report workflow: collect → insight-select → write → check → render → deliver. Deterministic code
 * with model steps inside `@hesabu/agents`; every number comes from `@hesabu/analytics`. Idempotent per
 * report row: a report that is already `done` is left alone unless the API reset it (`force`).
 */
import {
  addMonths, computeFacts, FactsSheetSchema, isoMidnight, parseIsoDate, type FactsSheet, type Period,
  previousPeriod, periodContaining, toLocalDate,
} from '@hesabu/analytics';
import {
  AnthropicModelClient, BudgetGuard, FakeModelClient, produceReport, ReportDocumentSchema,
  type AiConfig, type CostLedger, type ModelClient, type ReportDocument,
} from '@hesabu/agents';
import { DbCostLedger, type Db, type ReportGenerateJob, type ReportRow, type TenantDb } from '@hesabu/db';

import type { Renderer } from './adapters/renderer.js';
import type { Storage } from './adapters/storage.js';
import { createSignedReportLink } from './links.js';

export interface WorkflowDeps {
  db: Db;
  renderer: Renderer;
  storage: Storage;
  ai: AiConfig;
  /** Builds the model client for one report; defaults to the real SDK client when AI is enabled, else a fake. */
  clientFactory?: (ctx: { guard: BudgetGuard; ledger: CostLedger; ai: AiConfig }) => ModelClient;
  appBaseUrl: string;
  reportLinkSecret: string | undefined;
  reportLinkTtlDays: number;
  enqueueDeliver: (job: { user_id: string; report_id: string; channels: ('email' | 'whatsapp')[] }) => Promise<void>;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface WorkflowResult {
  report: ReportRow;
  facts: FactsSheet;
  document: ReportDocument;
  writer: 'model' | 'fallback';
  deliveriesQueued: ('email' | 'whatsapp')[];
}

/** The transaction window the facts engine needs: six months before the period plus from 1 January, to the period end. */
export function collectionWindow(period: Period): { from: string; to: string } {
  const start = parseIsoDate(period.start);
  const sixMonthsBack = addMonths(start, -6);
  const janFirst = { year: start.year, month: 1, day: 1 };
  const from = sixMonthsBack.year < janFirst.year || (sixMonthsBack.year === janFirst.year && sixMonthsBack.month < janFirst.month) ? sixMonthsBack : janFirst;
  return { from: isoMidnight(from), to: period.end };
}

function periodFromReport(report: ReportRow, weekStart: 'monday' | 'sunday', now: Date): Period {
  const kind = report.kind === 'weekly' ? 'week' : 'month';
  return periodContaining(kind, toLocalDate(report.period_start), { weekStart, now });
}

export async function runReportJob(deps: WorkflowDeps, job: ReportGenerateJob): Promise<WorkflowResult | null> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => {});
  const tenant: TenantDb = deps.db.forUser(job.user_id);
  const report = await tenant.getReport(job.report_id);
  if (!report) {
    log(`workflow: report ${job.report_id} not found for user; dropping`);
    return null;
  }
  if (report.status === 'done') {
    log(`workflow: report ${report.id} already done; skipping`);
    if (job.deliver) await queueDeliveries(deps, tenant, report);
    return null;
  }
  try {
    // 1. collect
    await tenant.updateReport(report.id, { status: 'collecting', last_error: null });
    const user = await tenant.getUser();
    if (!user) throw new Error('user not found');
    const period = periodFromReport(report, user.week_start, now);
    const window = collectionWindow(period);
    const [transactions, accounts, categories, budgets] = await Promise.all([
      tenant.listTransactions(window),
      tenant.listAccounts(),
      tenant.listCategories(),
      tenant.listBudgets(),
    ]);
    const previous = await tenant.findReport(report.kind, previousPeriod(period, { weekStart: user.week_start, now }).start);
    const lateArrivals = previous?.generated_at ? await tenant.countLateArrivals({ from: previous.period_start, to: previous.period_end }, previous.generated_at) : 0;
    const previousTotals = previous?.facts_json ? FactsSheetSchema.safeParse(previous.facts_json) : null;
    const facts = computeFacts({
      user: { locale: user.locale, week_start: user.week_start, display_name: user.display_name },
      kind: report.kind,
      period,
      transactions,
      accounts,
      categories: categories.map((c) => ({ id: c.category_id, name_en: c.name_en, name_sw: c.name_sw, kind: c.kind as never })),
      budgets: budgets.map((b) => ({ category_id: b.category_id, limit_cents: b.limit_cents, period: b.period })),
      unknown_message_count: 0,
      late_arrival_count: lateArrivals,
      generated_at: now.toISOString(),
      previous_report_totals: previousTotals?.success
        ? { out_cents: previousTotals.data.totals.out.cents, in_cents: previousTotals.data.totals.in.cents, fees_cents: previousTotals.data.totals.fees.cents }
        : null,
    });
    FactsSheetSchema.parse(facts);
    await tenant.updateReport(report.id, { status: 'writing', facts_json: facts });
    await tenant.insertInsights(
      report.id,
      facts.candidate_insights.map((i) => ({ insight_id: i.id, kind: i.kind, severity: i.severity, payload: i.params, drilldown: i.drilldown, selected: false })),
    );

    // 2–4. insight-select → write → check (model steps with the numbers-only fallback)
    const ledger = new DbCostLedger(deps.db, job.user_id, report.id);
    const guard = new BudgetGuard({ config: deps.ai, ledger });
    const client = deps.clientFactory
      ? deps.clientFactory({ guard, ledger, ai: deps.ai })
      : deps.ai.enabled
        ? new AnthropicModelClient({ config: deps.ai, guard, ledger, now: () => now })
        : new FakeModelClient([]);
    const produced = await produceReport(facts, { report_id: report.id, kind: report.kind, baseUrl: deps.appBaseUrl }, {
      client, guard, ledger, locale: user.locale, now,
    });
    const document = ReportDocumentSchema.parse(produced.document);
    await tenant.updateReport(report.id, {
      status: 'rendering',
      writer: produced.writer,
      document_json: document,
      input_tokens: document.meta.input_tokens,
      output_tokens: document.meta.output_tokens,
      cost_usd: document.meta.cost_usd,
    });
    const selectedIds = new Set((produced.selection?.selected ?? []).map((s) => s.id));
    if (selectedIds.size > 0) {
      await tenant.insertInsights(
        report.id,
        facts.candidate_insights.map((i) => ({ insight_id: i.id, kind: i.kind, severity: i.severity, payload: i.params, drilldown: i.drilldown, selected: selectedIds.has(i.id) })),
      );
    }

    // 5. render and store artefacts
    const link = await createSignedReportLink(tenant, report.id, { secret: deps.reportLinkSecret, ttlDays: deps.reportLinkTtlDays, appBaseUrl: deps.appBaseUrl, now });
    const rendered = await deps.renderer.render(document, facts, { theme: 'light', locale: user.locale, baseUrl: deps.appBaseUrl, reportUrl: link.url });
    const prefix = `reports/${job.user_id}/${report.id}`;
    const hero = await deps.storage.put(`${prefix}/hero.png`, rendered.heroPng, 'image/png');
    const pdf = await deps.storage.put(`${prefix}/report.pdf`, rendered.pdf, 'application/pdf');
    await deps.storage.put(`${prefix}/web.html`, rendered.webHtml, 'text/html; charset=utf-8');
    await deps.storage.put(`${prefix}/email.html`, rendered.emailHtml, 'text/html; charset=utf-8');
    await deps.storage.put(`${prefix}/email.txt`, rendered.emailText, 'text/plain; charset=utf-8');
    const chartKeys: Record<string, string> = {};
    for (const [chartId, png] of Object.entries(rendered.chartPngs)) {
      const key = `${prefix}/charts/${chartId}.png`;
      await deps.storage.put(key, png, 'image/png');
      chartKeys[chartId] = key;
    }
    const done = await tenant.updateReport(report.id, {
      status: 'done',
      generated_at: now.toISOString(),
      artefacts: {
        hero_png_key: `${prefix}/hero.png`,
        pdf_key: `${prefix}/report.pdf`,
        html_key: `${prefix}/web.html`,
        chart_keys: chartKeys,
        hero_png_url: hero.url,
        pdf_url: pdf.url,
        web_url: link.url,
      },
    });
    await tenant.audit('worker', 'report.generated', { kind: report.kind, period_start: report.period_start, writer: produced.writer, fallback_reason: produced.fallback_reason, renderer: deps.renderer.name });
    log(`workflow: ${report.kind} ${report.period_start} done (${produced.writer}) for ${job.user_id}`);

    // 6. deliver
    const deliveriesQueued = job.deliver ? await queueDeliveries(deps, tenant, done) : [];
    return { report: done, facts, document, writer: produced.writer, deliveriesQueued };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await tenant.updateReport(report.id, { status: 'failed', last_error: message.slice(0, 500) });
    await tenant.audit('worker', 'report.failed', { kind: report.kind, period_start: report.period_start, error: message.slice(0, 200) });
    throw err;
  }
}

async function queueDeliveries(deps: WorkflowDeps, tenant: TenantDb, report: ReportRow): Promise<('email' | 'whatsapp')[]> {
  const prefs = await tenant.getPreferences();
  const channels = prefs.channels.filter((c): c is 'email' | 'whatsapp' => c === 'email' || c === 'whatsapp');
  if (channels.length === 0) return [];
  for (const ch of channels) await tenant.ensureDelivery(report.id, ch);
  await deps.enqueueDeliver({ user_id: tenant.userId, report_id: report.id, channels });
  return channels;
}
