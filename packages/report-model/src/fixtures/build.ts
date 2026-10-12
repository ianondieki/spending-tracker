/**
 * Fixture builder: turns a small, hand-authored description of a period (daily figures, categories, merchants,
 * people, accounts and so on, all in whole shillings) into a complete, internally consistent `FactsSheet`.
 * Totals, shares, deltas, averages and `display_strings` are computed here, never typed by hand, so the fixtures
 * obey the same rule as production numbers: computed, never generated.
 */
import { count, delta, formatKsh, money, pct, ratioPct } from '../format.js';
import type {
  AccountFact,
  BudgetFact,
  CandidateInsight,
  CategoryFact,
  DayFact,
  Drilldown,
  FactsSheet,
  MerchantFact,
  Period,
  PersonFact,
  RecurringFact,
  Totals,
  TxFact,
} from '../types.js';

export const KSH = 100; // cents per shilling; inputs below are whole shillings

const WEEKDAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS_SW = ['Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi', 'Jumapili'];

export interface PeriodInput {
  readonly kind: 'week' | 'month';
  readonly start: string; // YYYY-MM-DD, Africa/Nairobi
  readonly end: string; // YYYY-MM-DD inclusive
  readonly label_en: string;
  readonly label_sw: string;
  readonly days_elapsed?: number;
}

export interface DayInput {
  readonly date: string;
  readonly out: number;
  readonly in: number;
  readonly count: number;
}

export interface CategoryInput {
  readonly id: string;
  readonly en: string;
  readonly sw: string;
  readonly out: number;
  readonly previous: number;
  readonly count: number;
  readonly top_merchant: string | null;
}

export interface MerchantInput {
  readonly name: string;
  readonly category_id: string | null;
  readonly out: number;
  readonly count: number;
  readonly is_new?: boolean;
}

export interface PersonInput {
  readonly name: string;
  readonly ref_masked: string | null;
  readonly sent: number;
  readonly received: number;
  readonly count: number;
}

export interface AccountInput {
  readonly ref: string;
  readonly label: string;
  readonly provider: string;
  readonly balance: number | null;
  readonly balance_at: string | null;
  readonly in: number;
  readonly out: number;
  readonly fees: number;
  /** closing balance per day of the period, whole shillings */
  readonly series: readonly number[];
}

export interface TotalsInput {
  readonly fees: number;
  readonly transfers: number;
  readonly cash_withdrawn: number;
  readonly savings_out: number;
  readonly loan_repayments: number;
}

export interface PreviousTotalsInput extends TotalsInput {
  readonly in: number;
  readonly out: number;
  readonly transaction_count: number;
}

export interface BudgetInput {
  readonly category_id: string;
  readonly limit: number;
  readonly spent: number;
  readonly projected: number;
}

export interface RecurringInput {
  readonly merchant: string;
  readonly category_id: string | null;
  readonly cadence: RecurringFact['cadence'];
  readonly typical: number;
  readonly last_paid: string;
  readonly next_expected: string | null;
  readonly confidence: number;
  readonly is_subscription: boolean;
}

export interface TxInput {
  readonly id: string;
  readonly occurred_at: string;
  readonly amount: number;
  readonly direction: 'in' | 'out';
  readonly counterparty: string | null;
  readonly category_id: string | null;
  readonly type: string;
}

export interface TrendMonthInput {
  readonly month: string;
  readonly label_en: string;
  readonly label_sw: string;
  readonly in: number;
  readonly out: number;
  readonly fees: number;
}

export interface InsightInput {
  readonly id: string;
  readonly kind: CandidateInsight['kind'];
  readonly severity: CandidateInsight['severity'];
  readonly params: CandidateInsight['params'];
  readonly drilldown?: Partial<Drilldown['filter']>;
}

export interface FixtureInput {
  readonly generated_at: string;
  readonly user: FactsSheet['user'];
  readonly period: PeriodInput;
  readonly previous_period: PeriodInput;
  readonly days: readonly DayInput[];
  readonly categories: readonly CategoryInput[];
  readonly merchants: readonly MerchantInput[];
  readonly people: readonly PersonInput[];
  readonly accounts: readonly AccountInput[];
  readonly totals: TotalsInput;
  readonly previous_totals: PreviousTotalsInput;
  readonly time_of_day: readonly { readonly bucket: FactsSheet['time_of_day'][number]['bucket']; readonly out: number; readonly count: number }[];
  readonly largest: readonly TxInput[];
  readonly new_merchants: readonly string[];
  readonly recurring: readonly RecurringInput[];
  readonly budgets: readonly BudgetInput[];
  readonly overdraft: { readonly drawdown: number; readonly repaid: number; readonly cost: number; readonly days: number };
  readonly income: readonly { readonly source: string; readonly kind: FactsSheet['income'][number]['kind']; readonly in: number; readonly count: number }[];
  readonly trend_months: readonly TrendMonthInput[];
  readonly ytd: (PreviousTotalsInput & { readonly in: number; readonly out: number }) | null;
  readonly anomalies: FactsSheet['anomalies'];
  readonly late_arrivals: number;
  readonly unknown_messages: number;
  readonly candidate_insights: readonly InsightInput[];
}

function isoStart(date: string): string {
  return `${date}T00:00:00+03:00`;
}

function isoEnd(date: string): string {
  return `${date}T23:59:59+03:00`;
}

function daysBetween(start: string, end: string): number {
  const a = Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
  const b = Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10));
  return Math.round((b - a) / 86_400_000) + 1;
}

/** ISO weekday index, Monday = 0. */
export function weekdayIndex(date: string): number {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  return (d.getUTCDay() + 6) % 7;
}

function period(p: PeriodInput): Period {
  const days = daysBetween(p.start, p.end);
  return {
    kind: p.kind,
    start: isoStart(p.start),
    end: isoEnd(p.end),
    label_en: p.label_en,
    label_sw: p.label_sw,
    days,
    days_elapsed: p.days_elapsed ?? days,
    timezone: 'Africa/Nairobi',
  };
}

function drilldown(p: Period, filter: Partial<Drilldown['filter']> = {}): Drilldown {
  return { kind: 'transactions', filter: { from: p.start, to: p.end, ...filter } };
}

function totals(input: { in: number; out: number; transaction_count: number } & TotalsInput): Totals {
  const inC = input.in * KSH;
  const outC = input.out * KSH;
  const feesC = input.fees * KSH;
  return {
    in: money(inC),
    out: money(outC),
    fees: money(feesC),
    net: money(inC - outC - feesC),
    transfers: money(input.transfers * KSH),
    cash_withdrawn: money(input.cash_withdrawn * KSH),
    savings_out: money(input.savings_out * KSH),
    loan_repayments: money(input.loan_repayments * KSH),
    transaction_count: count(input.transaction_count),
    fee_ratio: ratioPct(feesC, outC),
    savings_rate: ratioPct(input.savings_out * KSH, inC),
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Collects every `display` string (and the period and month labels) in document order, de-duplicated. */
export function collectDisplayStrings(sheet: Omit<FactsSheet, 'display_strings'>): string[] {
  const out = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if ((key === 'display' || key === 'label_en' || key === 'label_sw') && typeof value === 'string') out.add(value);
        else walk(value);
      }
    }
  };
  walk(sheet);
  return [...out];
}

export function buildFactsSheet(input: FixtureInput): FactsSheet {
  const p = period(input.period);
  const prev = period(input.previous_period);

  if (input.days.length !== p.days) throw new Error(`expected ${p.days} days, got ${input.days.length}`);
  const outTotal = sum(input.days.map((d) => d.out));
  const inTotal = sum(input.days.map((d) => d.in));
  const catTotal = sum(input.categories.map((c) => c.out));
  if (catTotal !== outTotal) throw new Error(`categories sum to ${catTotal}, days sum to ${outTotal}`);
  const accOut = sum(input.accounts.map((a) => a.out));
  if (accOut !== outTotal + input.totals.transfers) {
    throw new Error(`accounts out ${accOut} must equal spend ${outTotal} + transfers ${input.totals.transfers}`);
  }
  const todTotal = sum(input.time_of_day.map((t) => t.out));
  if (todTotal !== outTotal) throw new Error(`time_of_day sums to ${todTotal}, not ${outTotal}`);

  const txCount = sum(input.days.map((d) => d.count));
  const cur = totals({ in: inTotal, out: outTotal, transaction_count: txCount, ...input.totals });
  const before = totals(input.previous_totals);

  const daily: DayFact[] = input.days.map((d) => ({
    date: d.date,
    weekday_en: WEEKDAYS_EN[weekdayIndex(d.date)]!,
    weekday_sw: WEEKDAYS_SW[weekdayIndex(d.date)]!,
    out: money(d.out * KSH),
    in: money(d.in * KSH),
    count: count(d.count),
  }));
  const spendiest = daily.reduce<DayFact | null>((best, d) => (best && best.out.cents >= d.out.cents ? best : d), null);
  const weekendOut = sum(input.days.filter((d) => weekdayIndex(d.date) >= 5).map((d) => d.out));

  const categories: CategoryFact[] = [...input.categories]
    .sort((a, b) => b.out - a.out)
    .map((c) => ({
      category_id: c.id,
      name_en: c.en,
      name_sw: c.sw,
      out: money(c.out * KSH),
      share: ratioPct(c.out, outTotal),
      delta: delta(c.out * KSH, c.previous * KSH),
      count: count(c.count),
      top_merchant: c.top_merchant,
      drilldown: drilldown(p, { category_id: c.id, direction: 'out' }),
    }));

  const merchants: MerchantFact[] = [...input.merchants]
    .sort((a, b) => b.out - a.out)
    .slice(0, 15)
    .map((m) => ({
      name: m.name,
      category_id: m.category_id,
      out: money(m.out * KSH),
      count: count(m.count),
      is_new: m.is_new ?? false,
      drilldown: drilldown(p, { merchant: m.name, direction: 'out' }),
    }));

  const people: PersonFact[] = input.people.slice(0, 10).map((x) => ({
    name: x.name,
    ref_masked: x.ref_masked,
    sent: money(x.sent * KSH),
    received: money(x.received * KSH),
    count: count(x.count),
    drilldown: drilldown(p, { counterparty_ref: x.ref_masked }),
  }));

  const accounts: AccountFact[] = input.accounts.map((a) => ({
    account_ref: a.ref,
    label: a.label,
    provider: a.provider,
    balance: a.balance === null ? null : money(a.balance * KSH),
    balance_at: a.balance_at,
    in: money(a.in * KSH),
    out: money(a.out * KSH),
    fees: money(a.fees * KSH),
    balance_series: a.series.map((cents, i) => ({ at: isoEnd(input.days[i]!.date), cents: cents * KSH })),
  }));

  const largest: TxFact[] = input.largest.slice(0, 5).map((t) => ({
    id: t.id,
    occurred_at: t.occurred_at,
    amount: money(t.amount * KSH),
    direction: t.direction,
    counterparty: t.counterparty,
    category_id: t.category_id,
    type: t.type,
  }));

  const recurring: RecurringFact[] = input.recurring.map((r) => ({
    merchant: r.merchant,
    category_id: r.category_id,
    cadence: r.cadence,
    typical_amount: money(r.typical * KSH),
    last_paid: r.last_paid,
    next_expected: r.next_expected,
    confidence: r.confidence,
    is_subscription: r.is_subscription,
    drilldown: drilldown(p, { merchant: r.merchant }),
  }));

  const budgets: BudgetFact[] = input.budgets.map((b) => ({
    category_id: b.category_id,
    limit: money(b.limit * KSH),
    spent: money(b.spent * KSH),
    projected: money(b.projected * KSH),
    used: ratioPct(b.spent, b.limit),
    status: b.spent > b.limit ? 'over' : b.projected >= b.limit ? 'watch' : 'ok',
  }));

  const trend = input.trend_months.map((m) => ({
    month: m.month,
    label_en: m.label_en,
    label_sw: m.label_sw,
    in: money(m.in * KSH),
    out: money(m.out * KSH),
    fees: money(m.fees * KSH),
    net: money((m.in - m.out - m.fees) * KSH),
    is_current: m.month === input.period.start.slice(0, 7) && input.period.kind === 'month',
  }));

  const candidate_insights: CandidateInsight[] = input.candidate_insights.map((i) => ({
    id: i.id,
    kind: i.kind,
    severity: i.severity,
    params: i.params,
    drilldown: drilldown(p, i.drilldown),
  }));

  const sheet: Omit<FactsSheet, 'display_strings'> = {
    version: '1',
    generated_at: input.generated_at,
    user: input.user,
    period: p,
    previous_period: prev,
    totals: cur,
    previous_totals: before,
    deltas: {
      out: delta(cur.out.cents, before.out.cents),
      in: delta(cur.in.cents, before.in.cents),
      fees: delta(cur.fees.cents, before.fees.cents),
      net: delta(cur.net.cents, before.net.cents),
    },
    categories,
    merchants,
    people,
    accounts,
    daily,
    average_daily_out: money(Math.round(cur.out.cents / p.days)),
    spendiest_day: spendiest,
    weekday_weekend: {
      weekday_out: money((outTotal - weekendOut) * KSH),
      weekend_out: money(weekendOut * KSH),
      weekend_share: ratioPct(weekendOut, outTotal),
    },
    time_of_day: input.time_of_day.map((t) => ({ bucket: t.bucket, out: money(t.out * KSH), count: count(t.count) })),
    largest,
    new_merchants: [...input.new_merchants],
    recurring,
    budgets,
    overdraft: {
      fuliza_drawdown: money(input.overdraft.drawdown * KSH),
      fuliza_repaid: money(input.overdraft.repaid * KSH),
      fuliza_cost: money(input.overdraft.cost * KSH),
      days_in_overdraft: count(input.overdraft.days),
    },
    income: input.income.map((s) => ({ source: s.source, kind: s.kind, in: money(s.in * KSH), count: count(s.count) })),
    trend_months: trend,
    ytd: input.ytd ? totals(input.ytd) : null,
    anomalies: input.anomalies,
    late_arrivals: count(input.late_arrivals),
    unknown_messages: count(input.unknown_messages),
    candidate_insights,
  };

  return { ...sheet, display_strings: collectDisplayStrings(sheet) };
}

/** Convenience for authoring documents: the display string for a whole-shilling amount. */
export function ksh(shillings: number): string {
  return formatKsh(shillings * KSH);
}

export function signedKsh(shillings: number): string {
  return formatKsh(shillings * KSH, { signed: true });
}

export { pct };
