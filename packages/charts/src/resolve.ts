/**
 * Turns a `chart` section of a ReportDocument plus its FactsSheet into the chart element. The section's
 * `data_ref` is a JSON pointer into the sheet; `chart_type` picks the component. All numbers shown come from the
 * sheet's display strings; nothing is formatted from floats here except the folded "Other" slice, which is a sum
 * of sheet integers.
 */
import { createElement, type ReactElement } from 'react';

import type { ChartSection, FactsSheet, Locale } from '@hesabu/report-model';

import { BalanceSparkline, type BalanceSparklineData } from './charts/BalanceSparkline.js';
import { BudgetBullets, type BudgetBulletsData } from './charts/BudgetBullets.js';
import { CalendarHeatmap, type CalendarHeatmapData } from './charts/CalendarHeatmap.js';
import { DailyBars, type DailyBarsData } from './charts/DailyBars.js';
import { Donut, type DonutData, foldSlices } from './charts/Donut.js';
import { FeeMeter, type FeeMeterData } from './charts/FeeMeter.js';
import { StackedInOut, type StackedInOutData } from './charts/StackedInOut.js';
import { TopBars, type TopBarsData } from './charts/TopBars.js';
import { TrendLines, type TrendLinesData } from './charts/TrendLines.js';
import { Waterfall, type WaterfallData, waterfallSteps } from './charts/Waterfall.js';
import type { BaseChartProps } from './common.js';
import { longDate, shortDate, weekdayShort } from './dates.js';
import { chartLabels } from './labels.js';
import type { Theme } from './tokens.js';

export interface ResolveOptions {
  readonly locale: Locale;
  readonly theme?: Theme;
  readonly width?: number;
  readonly showTable?: boolean;
  /** Use the section's own alt text (default) or the chart's computed one. */
  readonly preferSectionAltText?: boolean;
}

function categoryName(facts: FactsSheet, id: string, locale: Locale): string {
  const c = facts.categories.find((x) => x.category_id === id);
  return c ? (locale === 'sw' ? c.name_sw : c.name_en) : id;
}

export function donutData(facts: FactsSheet, locale: Locale): DonutData {
  const l = chartLabels(locale);
  const slices = facts.categories.map((c) => ({ name: locale === 'sw' ? c.name_sw : c.name_en, cents: c.out.cents, display: c.out.display, share: c.share.display }));
  return { slices: foldSlices(slices, l.other), total: facts.totals.out };
}

export function dailyBarsData(facts: FactsSheet, locale: Locale): DailyBarsData {
  const weekly = facts.period.kind === 'week';
  return {
    bars: facts.daily.map((d) => ({
      label: weekly ? weekdayShort(d.date, locale) : String(+d.date.slice(8, 10)),
      long: longDate(d.date, locale),
      cents: d.out.cents,
      display: d.out.display,
    })),
    average: facts.average_daily_out,
  };
}

export function stackedInOutData(facts: FactsSheet, locale: Locale): StackedInOutData {
  const weekly = facts.period.kind === 'week';
  const cur = weekly ? (locale === 'sw' ? 'Wiki hii' : 'This week') : locale === 'sw' ? facts.period.label_sw : facts.period.label_en;
  const prev = weekly ? (locale === 'sw' ? 'Wiki iliyopita' : 'Last week') : locale === 'sw' ? facts.previous_period.label_sw : facts.previous_period.label_en;
  return {
    current: { label: cur, in: facts.totals.in, out: facts.totals.out, net: facts.totals.net },
    previous: { label: prev, in: facts.previous_totals.in, out: facts.previous_totals.out, net: facts.previous_totals.net },
  };
}

export function trendLinesData(facts: FactsSheet, locale: Locale): TrendLinesData {
  return { points: facts.trend_months.map((m) => ({ label: locale === 'sw' ? m.label_sw : m.label_en, in: m.in, out: m.out, net: m.net, isCurrent: m.is_current })) };
}

export function topBarsData(facts: FactsSheet, locale: Locale, ref: string): TopBarsData {
  const l = chartLabels(locale);
  if (ref === '/people') {
    return {
      nameLabel: locale === 'sw' ? 'Mtu' : 'Person',
      items: facts.people.filter((p) => p.sent.cents > 0).map((p) => ({ name: p.name, cents: p.sent.cents, display: p.sent.display })),
    };
  }
  return { nameLabel: l.merchant, items: facts.merchants.map((m) => ({ name: m.name, cents: m.out.cents, display: m.out.display, isNew: m.is_new })) };
}

export function waterfallData(facts: FactsSheet, locale: Locale): WaterfallData {
  const l = chartLabels(locale);
  return {
    steps: waterfallSteps(
      facts.totals.in,
      facts.categories.map((c) => ({ name: locale === 'sw' ? c.name_sw : c.name_en, cents: c.out.cents, display: c.out.display })),
      facts.totals.fees,
      facts.totals.net,
      { income: l.income, other: l.other, fees: l.fees, net: l.net },
    ),
  };
}

export function calendarHeatmapData(facts: FactsSheet, locale: Locale): CalendarHeatmapData {
  return { days: facts.daily.map((d) => ({ date: d.date, cents: d.out.cents, display: d.out.display, long: longDate(d.date, locale) })) };
}

export function budgetBulletsData(facts: FactsSheet, locale: Locale): BudgetBulletsData {
  return {
    items: facts.budgets.map((b) => ({ name: categoryName(facts, b.category_id, locale), limit: b.limit, spent: b.spent, projected: b.projected, used: b.used.display, status: b.status })),
  };
}

export function balanceSparklineData(facts: FactsSheet, locale: Locale, ref: string): BalanceSparklineData {
  const m = /^\/accounts\/(\d+)\/balance_series$/.exec(ref);
  const index = m ? Number(m[1]) : 0;
  const account = facts.accounts[index];
  if (!account) throw new Error(`no account at ${ref}`);
  return {
    account: account.label,
    points: account.balance_series.map((p) => ({ at: p.at, cents: p.cents, label: shortDate(p.at.slice(0, 10), locale) })),
  };
}

export function feeMeterData(facts: FactsSheet): FeeMeterData {
  return { fees: facts.totals.fees, out: facts.totals.out, ratio: facts.totals.fee_ratio };
}

export function resolveChart(section: ChartSection, facts: FactsSheet, opts: ResolveOptions): ReactElement {
  const { locale, theme, width, showTable, preferSectionAltText = true } = opts;
  const base: BaseChartProps = {
    id: section.chart_id,
    title: section.title,
    takeaway: section.takeaway ?? null,
    locale,
    theme,
    width,
    showTable,
    altText: preferSectionAltText ? section.alt_text : undefined,
  };
  switch (section.chart_type) {
    case 'donut':
      return createElement(Donut, { ...base, data: donutData(facts, locale) });
    case 'daily_bars':
      return createElement(DailyBars, { ...base, data: dailyBarsData(facts, locale) });
    case 'stacked_in_out':
      return createElement(StackedInOut, { ...base, data: stackedInOutData(facts, locale) });
    case 'trend_lines':
      return createElement(TrendLines, { ...base, data: trendLinesData(facts, locale) });
    case 'top_bars':
      return createElement(TopBars, { ...base, data: topBarsData(facts, locale, section.data_ref) });
    case 'waterfall':
      return createElement(Waterfall, { ...base, data: waterfallData(facts, locale) });
    case 'calendar_heatmap':
      return createElement(CalendarHeatmap, { ...base, data: calendarHeatmapData(facts, locale) });
    case 'budget_bullets':
      return createElement(BudgetBullets, { ...base, data: budgetBulletsData(facts, locale) });
    case 'balance_sparkline':
      return createElement(BalanceSparkline, { ...base, data: balanceSparklineData(facts, locale, section.data_ref) });
    case 'fee_meter':
      return createElement(FeeMeter, { ...base, data: feeMeterData(facts) });
  }
}
