/**
 * The numbers-only writer (P14). Builds a complete ReportDocument from the FactsSheet and the i18n templates
 * alone: no model, no invented numbers, every figure a display string from the sheet. Used when AI is off,
 * the budget is spent, or any model step fails; it must always produce a valid document.
 */
import {
  type CandidateInsight,
  type CategoryFact,
  type Delta,
  type FactsSheet,
} from '@hesabu/analytics';
import { type Locale, type MessageKey, renderInsight, renderTemplate, t } from '@hesabu/i18n';

import {
  type ChartSection,
  type ChartType,
  type InsightsSection,
  type ReportDocument,
  type Section,
  type WatchSection,
} from './contracts/report-document.js';
import { type CheckableDocument, factCheck } from './fact-check.js';

export type ReportKind = 'weekly' | 'monthly';

export interface ReportContext {
  readonly report_id: string;
  readonly kind: ReportKind;
  readonly locale: Locale;
  /** Base URL of the web viewer; adds the "Full report" link to the WhatsApp caption when set. */
  readonly baseUrl?: string;
  /** `meta.generated_at`; defaults to the current time. */
  readonly now?: Date;
}

export interface FallbackOptions extends ReportContext {
  /** Insight ids to render, in order (e.g. a model's selection). Defaults to the engine's order. */
  readonly insightIds?: readonly string[];
}

export const MAX_INSIGHTS: Readonly<Record<ReportKind, number>> = { weekly: 7, monthly: 12 };
export const LIMITS = {
  title: 80,
  verdict: 140,
  headline: 90,
  body: 280,
  callout: 300,
  watchItem: 160,
  caption: 1000,
  subject: 80,
  preheader: 120,
} as const;

/** Chart ids are stable strings shared with the renderer; data_ref points into the FactsSheet (chart-spec.md). */
export const CHART_CATALOGUE: Readonly<
  Record<string, { readonly type: ChartType; readonly data_ref: string }>
> = {
  donut: { type: 'donut', data_ref: '/categories' },
  daily_bars: { type: 'daily_bars', data_ref: '/daily' },
  stacked_in_out: { type: 'stacked_in_out', data_ref: '/totals' },
  top_bars_merchants: { type: 'top_bars', data_ref: '/merchants' },
  top_bars_people: { type: 'top_bars', data_ref: '/people' },
  trend_lines: { type: 'trend_lines', data_ref: '/trend_months' },
  waterfall: { type: 'waterfall', data_ref: '/totals' },
  calendar_heatmap: { type: 'calendar_heatmap', data_ref: '/daily' },
  budget_bullets: { type: 'budget_bullets', data_ref: '/budgets' },
  balance_sparkline: { type: 'balance_sparkline', data_ref: '/accounts/0/balance_series' },
  fee_meter: { type: 'fee_meter', data_ref: '/totals/fees' },
};

const LIST_SEPARATOR = '; ';

function categoryName(c: Pick<CategoryFact, 'name_en' | 'name_sw'>, locale: Locale): string {
  return locale === 'sw' ? c.name_sw : c.name_en;
}

export function periodLabel(facts: FactsSheet, locale: Locale): string {
  return locale === 'sw' ? facts.period.label_sw : facts.period.label_en;
}

export function reportUrl(baseUrl: string, reportId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/r/${encodeURIComponent(reportId)}`;
}

/** A signed delta for display, or null when there is nothing to compare with. */
function deltaOrNull(d: Delta): string | null {
  return d.direction === 'na' ? null : d.display;
}

/** Last-resort length guard at a word boundary; templates are sized so this should never trigger. */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function chart(id: string, title: string, alt: string): ChartSection {
  const entry = CHART_CATALOGUE[id];
  if (entry === undefined) throw new Error(`unknown chart id ${id}`);
  return {
    type: 'chart',
    chart_id: id,
    chart_type: entry.type,
    title,
    takeaway: null,
    data_ref: entry.data_ref,
    alt_text: alt,
  };
}

function heroSection(facts: FactsSheet, kind: ReportKind, locale: Locale): Section {
  const d = facts.deltas.out;
  const verdict = renderTemplate(locale, `hero.verdict.${kind}.${d.direction}` as MessageKey, {
    delta: d.display,
    delta_pct: d.pct.display,
  });
  const tally =
    kind === 'weekly'
      ? facts.daily.map((day) => ({
          label: locale === 'sw' ? day.weekday_sw : day.weekday_en,
          value: day.out.display,
          cents: day.out.cents,
        }))
      : facts.categories.slice(0, 7).map((c) => ({
          label: categoryName(c, locale),
          value: c.out.display,
          cents: c.out.cents,
        }));
  return {
    type: 'hero',
    total_out: facts.totals.out.display,
    delta: d.display,
    delta_direction: d.direction,
    verdict: clamp(verdict, LIMITS.verdict),
    tally,
  };
}

function kpiSection(facts: FactsSheet, locale: Locale): Section {
  const { totals, deltas } = facts;
  return {
    type: 'kpis',
    items: [
      {
        label: t(locale, 'kpi.in'),
        value: totals.in.display,
        delta: deltaOrNull(deltas.in),
        tone: 'in',
      },
      {
        label: t(locale, 'kpi.out'),
        value: totals.out.display,
        delta: deltaOrNull(deltas.out),
        tone: 'out',
      },
      {
        label: t(locale, 'kpi.fees'),
        value: totals.fees.display,
        delta: deltaOrNull(deltas.fees),
        tone: 'fee',
      },
      {
        label: t(locale, 'kpi.net'),
        value: totals.net.display,
        delta: deltaOrNull(deltas.net),
        tone: 'neutral',
      },
    ],
  };
}

function budgetCategoryName(facts: FactsSheet, categoryId: string, locale: Locale): string {
  const c = facts.categories.find((x) => x.category_id === categoryId);
  return c === undefined ? categoryId.replace(/_/g, ' ') : categoryName(c, locale);
}

function chartSections(facts: FactsSheet, kind: ReportKind, locale: Locale): ChartSection[] {
  const charts: ChartSection[] = [];
  const r = (key: MessageKey, params: Record<string, string> = {}): string =>
    renderTemplate(locale, key, params);
  const { totals } = facts;

  // Donut: share of spending by category.
  const top = facts.categories[0];
  if (top === undefined) {
    charts.push(chart('donut', r('chart.donut.title_empty'), r('chart.donut.alt_empty')));
  } else {
    const items = facts.categories
      .slice(0, 6)
      .map((c) =>
        r('chart.item.amount_share', {
          name: categoryName(c, locale),
          amount: c.out.display,
          share: c.share.display,
        }),
      )
      .join(LIST_SEPARATOR);
    charts.push(
      chart(
        'donut',
        r('chart.donut.title', { category: categoryName(top, locale), share: top.share.display }),
        r('chart.donut.alt', { total: totals.out.display, items }),
      ),
    );
  }

  // Daily bars with the average line.
  const peak = facts.spendiest_day;
  if (peak === null || peak.out.cents <= 0) {
    charts.push(
      chart('daily_bars', r('chart.daily_bars.title_empty'), r('chart.daily_bars.alt_empty')),
    );
  } else {
    const weekday = locale === 'sw' ? peak.weekday_sw : peak.weekday_en;
    charts.push(
      chart(
        'daily_bars',
        r('chart.daily_bars.title', { weekday, amount: peak.out.display }),
        r('chart.daily_bars.alt', {
          weekday,
          date: peak.date,
          amount: peak.out.display,
          average: facts.average_daily_out.display,
        }),
      ),
    );
  }

  // Income versus spend, this period and the one before.
  const netKey: MessageKey =
    totals.net.cents > 0
      ? 'chart.stacked_in_out.title.positive'
      : totals.net.cents < 0
        ? 'chart.stacked_in_out.title.negative'
        : 'chart.stacked_in_out.title.zero';
  charts.push(
    chart(
      'stacked_in_out',
      r(netKey, { net: totals.net.display }),
      r('chart.stacked_in_out.alt', {
        in: totals.in.display,
        out: totals.out.display,
        previous_in: facts.previous_totals.in.display,
        previous_out: facts.previous_totals.out.display,
      }),
    ),
  );

  // Top merchants.
  const merchants = [...facts.merchants].sort((a, b) => b.out.cents - a.out.cents);
  const topMerchant = merchants[0];
  if (topMerchant !== undefined) {
    const items = merchants
      .slice(0, 8)
      .map((m) => r('chart.item.amount', { name: m.name, amount: m.out.display }))
      .join(LIST_SEPARATOR);
    charts.push(
      chart(
        'top_bars_merchants',
        r('chart.top_bars.merchants.title', {
          name: topMerchant.name,
          amount: topMerchant.out.display,
        }),
        r('chart.top_bars.merchants.alt', { items }),
      ),
    );
  }

  if (kind === 'monthly') {
    const months = facts.trend_months;
    const current = months.find((m) => m.is_current) ?? months.at(-1);
    const firstMonth = months[0];
    if (current !== undefined && firstMonth !== undefined) {
      const label = (m: { label_en: string; label_sw: string }): string =>
        locale === 'sw' ? m.label_sw : m.label_en;
      charts.push(
        chart(
          'trend_lines',
          r('chart.trend_lines.title', { out: current.out.display }),
          r('chart.trend_lines.alt', {
            first: label(firstMonth),
            last: label(current),
            in: current.in.display,
            out: current.out.display,
            net: current.net.display,
          }),
        ),
      );
    }
    if (top !== undefined) {
      charts.push(
        chart(
          'waterfall',
          r('chart.waterfall.title', { in: totals.in.display, net: totals.net.display }),
          r('chart.waterfall.alt', {
            in: totals.in.display,
            net: totals.net.display,
            category: categoryName(top, locale),
            amount: top.out.display,
          }),
        ),
      );
    }
    if (facts.daily.length > 0 && peak !== null && peak.out.cents > 0) {
      charts.push(
        chart(
          'calendar_heatmap',
          r('chart.calendar_heatmap.title', { date: peak.date, amount: peak.out.display }),
          r('chart.calendar_heatmap.alt', {
            period: periodLabel(facts, locale),
            date: peak.date,
            amount: peak.out.display,
            average: facts.average_daily_out.display,
          }),
        ),
      );
    }
  }

  if (facts.budgets.length > 0) {
    const byUse = [...facts.budgets].sort((a, b) => b.used.value - a.used.value);
    const first = byUse[0];
    if (first !== undefined) {
      const items = byUse
        .map((b) =>
          r('chart.budget_bullets.item', {
            category: budgetCategoryName(facts, b.category_id, locale),
            spent: b.spent.display,
            limit: b.limit.display,
            projected: b.projected.display,
          }),
        )
        .join(LIST_SEPARATOR);
      charts.push(
        chart(
          'budget_bullets',
          r('chart.budget_bullets.title', {
            category: budgetCategoryName(facts, first.category_id, locale),
            used: first.used.display,
          }),
          r('chart.budget_bullets.alt', { items }),
        ),
      );
    }
  }

  if (totals.fees.cents > 0) {
    charts.push(
      chart(
        'fee_meter',
        r('chart.fee_meter.title', {
          fee_ratio: totals.fee_ratio.display,
          fees: totals.fees.display,
        }),
        r('chart.fee_meter.alt', {
          fees: totals.fees.display,
          fee_ratio: totals.fee_ratio.display,
        }),
      ),
    );
  }
  return charts;
}

/** Renders one candidate from its template; null when it cannot be rendered safely or does not fit. */
export function renderCandidate(
  candidate: CandidateInsight,
  locale: Locale,
): InsightsSection['items'][number] | null {
  try {
    const copy = renderInsight(locale, candidate.kind, candidate.params);
    if (copy.headline.length > LIMITS.headline || copy.body.length > LIMITS.body) return null;
    return {
      insight_id: candidate.id,
      headline: copy.headline,
      body: copy.body,
      drilldown: candidate.drilldown,
    };
  } catch {
    return null;
  }
}

function insightsSection(
  facts: FactsSheet,
  kind: ReportKind,
  locale: Locale,
  ids?: readonly string[],
): InsightsSection | null {
  const byId = new Map(facts.candidate_insights.map((c) => [c.id, c]));
  const ordered =
    ids === undefined
      ? facts.candidate_insights
      : ids.map((id) => byId.get(id)).filter((c): c is CandidateInsight => c !== undefined);
  const items: InsightsSection['items'] = [];
  for (const candidate of ordered) {
    if (items.length >= MAX_INSIGHTS[kind]) break;
    const item = renderCandidate(candidate, locale);
    if (item !== null) items.push(item);
  }
  return items.length === 0
    ? null
    : { type: 'insights', title: t(locale, 'section.insights'), items };
}

function categoryTable(facts: FactsSheet, locale: Locale): Section | null {
  if (facts.categories.length === 0) return null;
  return {
    type: 'table',
    title: t(locale, 'section.categories'),
    columns: [
      t(locale, 'table.category'),
      t(locale, 'table.spent'),
      t(locale, 'table.share'),
      t(locale, 'table.change'),
    ],
    rows: facts.categories
      .slice(0, 8)
      .map((c) => [
        categoryName(c, locale),
        c.out.display,
        c.share.display,
        deltaOrNull(c.delta) ?? '',
      ]),
    numeric_columns: [1, 2, 3],
    total_row: [
      t(locale, 'table.total'),
      facts.totals.out.display,
      '',
      deltaOrNull(facts.deltas.out) ?? '',
    ],
  };
}

/** Date part of an ISO date or date-time; null when it is not one. */
function isoDay(value: string | null): string | null {
  if (value === null) return null;
  const m = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return m === null ? null : m[0];
}

function watchSection(facts: FactsSheet, kind: ReportKind, locale: Locale): WatchSection | null {
  const candidates: string[] = [];
  // Only what is still ahead: the first day after the period (period.end is that day's local midnight).
  const firstDayAfter = isoDay(facts.period.end) ?? '';
  for (const r of facts.recurring) {
    const date = isoDay(r.next_expected);
    if (r.is_subscription && date !== null && date >= firstDayAfter) {
      candidates.push(
        renderTemplate(locale, 'watch.subscription_due', {
          merchant: r.merchant,
          amount: r.typical_amount.display,
          date,
        }),
      );
    }
  }
  for (const b of facts.budgets) {
    const category = budgetCategoryName(facts, b.category_id, locale);
    if (b.status === 'over') {
      candidates.push(
        renderTemplate(locale, 'watch.budget_over', {
          category,
          spent: b.spent.display,
          limit: b.limit.display,
        }),
      );
    } else if (b.status === 'watch') {
      candidates.push(
        b.projected.cents > b.spent.cents
          ? renderTemplate(locale, 'watch.budget_at_risk', {
              category,
              spent: b.spent.display,
              limit: b.limit.display,
              projected: b.projected.display,
            })
          : renderTemplate(locale, 'watch.budget_used', {
              category,
              spent: b.spent.display,
              limit: b.limit.display,
            }),
      );
    }
  }
  for (const r of facts.recurring) {
    if (!r.is_subscription && (r.cadence === 'weekly' || r.cadence === 'monthly')) {
      candidates.push(
        renderTemplate(locale, `watch.recurring.${r.cadence}`, {
          merchant: r.merchant,
          amount: r.typical_amount.display,
        }),
      );
    }
  }
  const items = candidates.filter((s) => s.length <= LIMITS.watchItem).slice(0, 3);
  if (items.length === 0) return null;
  return { type: 'watch', title: t(locale, `section.watch.${kind}`), items };
}

function footerSection(facts: FactsSheet, locale: Locale): Section {
  return {
    type: 'footer',
    accounts_covered: facts.accounts.map((a) => a.label),
    computed_note: t(locale, 'footer.computed_note'),
    unknown_count: renderTemplate(locale, 'footer.unknown_count', {
      count: facts.unknown_messages.display,
    }),
  };
}

/** WhatsApp formatting characters are removed from untrusted names so they cannot restyle the caption. */
function plain(text: string): string {
  return text.replace(/[*_~`]/g, '');
}

export function buildCaption(opts: {
  title: string;
  periodLabel: string;
  spentLine: string;
  verdict: string;
  headlines: readonly string[];
  link: string | null;
}): string {
  const head = [
    `*${plain(opts.title)}*`,
    plain(opts.periodLabel),
    '',
    opts.spentLine,
    plain(opts.verdict),
  ];
  const tail = opts.link === null ? [] : ['', opts.link];
  let bullets = opts.headlines.slice(0, 3).map((h) => `• ${plain(h)}`);
  const compose = (): string =>
    [...head, ...(bullets.length > 0 ? ['', ...bullets] : []), ...tail].join('\n');
  let caption = compose();
  while (caption.length > LIMITS.caption && bullets.length > 0) {
    bullets = bullets.slice(0, -1);
    caption = compose();
  }
  return caption.length > LIMITS.caption ? caption.slice(0, LIMITS.caption) : caption;
}

/** Builds the numbers-only document. Never calls a model. */
export function writeFallback(facts: FactsSheet, opts: FallbackOptions): ReportDocument {
  const { kind, locale } = opts;
  const title = clamp(t(locale, `report.${kind}.title`), LIMITS.title);
  const label = periodLabel(facts, locale);

  const hero = heroSection(facts, kind, locale);
  const insights = insightsSection(facts, kind, locale, opts.insightIds);
  const sections: Section[] = [
    hero,
    kpiSection(facts, locale),
    ...chartSections(facts, kind, locale),
    ...(insights === null ? [] : [insights]),
  ];
  const table = categoryTable(facts, locale);
  if (table !== null) sections.push(table);
  if (facts.totals.fees.cents > 0) {
    sections.push({
      type: 'callout',
      tone: 'fee',
      body: clamp(
        renderTemplate(locale, 'callout.fees', {
          fees: facts.totals.fees.display,
          fee_ratio: facts.totals.fee_ratio.display,
        }),
        LIMITS.callout,
      ),
    });
  }
  const watch = watchSection(facts, kind, locale);
  if (watch !== null) sections.push(watch);
  sections.push(footerSection(facts, locale));

  const verdict = hero.type === 'hero' ? hero.verdict : '';
  const caption = buildCaption({
    title,
    periodLabel: label,
    spentLine: renderTemplate(locale, 'whatsapp.spent_line', { total: facts.totals.out.display }),
    verdict,
    headlines: insights?.items.map((i) => i.headline) ?? [],
    link:
      opts.baseUrl === undefined
        ? null
        : renderTemplate(locale, 'report.full_report_link', {
            url: reportUrl(opts.baseUrl, opts.report_id),
          }),
  });

  const subject = renderTemplate(locale, `email.subject.${kind}`, { period: label });
  const preheader =
    facts.deltas.out.direction === 'na'
      ? renderTemplate(locale, 'email.preheader_short', { total: facts.totals.out.display })
      : renderTemplate(locale, 'email.preheader', {
          total: facts.totals.out.display,
          delta: facts.deltas.out.display,
          fees: facts.totals.fees.display,
        });

  const body: CheckableDocument & Omit<ReportDocument, 'meta'> = {
    version: '1',
    report_id: opts.report_id,
    kind,
    locale,
    period_label: label,
    title,
    sections,
    whatsapp: { caption, hero_chart_ids: ['donut'] },
    email: {
      subject: subject.length <= LIMITS.subject ? subject : title,
      preheader:
        preheader.length <= LIMITS.preheader
          ? preheader
          : clamp(
              renderTemplate(locale, 'email.preheader_short', { total: facts.totals.out.display }),
              LIMITS.preheader,
            ),
    },
  };
  const check = factCheck(body, facts);
  return {
    ...body,
    meta: {
      generated_at: (opts.now ?? new Date()).toISOString(),
      facts_version: facts.version,
      writer: 'fallback',
      model: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      fact_check: { passed: check.passed, violations: check.violations, attempts: 0 },
    },
  };
}
