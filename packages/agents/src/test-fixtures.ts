/**
 * Hand-built, realistic FactsSheets for tests and the manual model script. Built with the analytics display
 * helpers so every display string has the engine's exact format, then validated with `FactsSheetSchema`.
 * `display_strings` holds every display value, label and insight param in the sheet (the fact-checker's
 * allow-list). Not exported from the package index.
 */
import {
  addDays,
  type CandidateInsight,
  type CategoryFact,
  count,
  type DayFact,
  delta,
  type Drilldown,
  type FactsSheet,
  FactsSheetSchema,
  isoDate,
  type LocalDate,
  money,
  monthNameEn,
  monthNameSw,
  parseIsoDate,
  pct,
  type Period,
  periodContaining,
  previousPeriod,
  ratioPct,
  type Totals,
  weekdayNameEn,
  weekdayNameSw,
} from '@hesabu/analytics';

import { type ReportDocument } from './contracts/report-document.js';
import { type ReportDraft } from './write.js';

type Kind = 'weekly' | 'monthly';

function drill(period: Period, extra: Drilldown['filter'] = {}): Drilldown {
  return { kind: 'transactions', filter: { from: period.start, to: period.end, ...extra } };
}

function totals(t: {
  in: number;
  out: number;
  fees: number;
  transfers: number;
  cash: number;
  savings: number;
  loans: number;
  txCount: number;
}): Totals {
  return {
    in: money(t.in),
    out: money(t.out),
    fees: money(t.fees),
    net: money(t.in - t.out),
    transfers: money(t.transfers),
    cash_withdrawn: money(t.cash),
    savings_out: money(t.savings),
    loan_repayments: money(t.loans),
    transaction_count: count(t.txCount),
    fee_ratio: pct(ratioPct(t.fees, t.out)),
    savings_rate: pct(ratioPct(t.savings, t.in)),
  };
}

interface CategorySeed {
  id: string;
  en: string;
  sw: string;
  out: number;
  previous: number;
  count: number;
  top: string | null;
}

function categories(seeds: CategorySeed[], totalOut: number, period: Period): CategoryFact[] {
  return [...seeds]
    .sort((a, b) => b.out - a.out)
    .map((s) => ({
      category_id: s.id,
      name_en: s.en,
      name_sw: s.sw,
      out: money(s.out),
      share: pct(ratioPct(s.out, totalOut)),
      delta: delta(s.out, s.previous),
      count: count(s.count),
      top_merchant: s.top,
      drilldown: drill(period, { category_id: s.id }),
    }));
}

function day(date: LocalDate, out: number, inCents: number, n: number): DayFact {
  return {
    date: isoDate(date),
    weekday_en: weekdayNameEn(date),
    weekday_sw: weekdayNameSw(date),
    out: money(out),
    in: money(inCents),
    count: count(n),
  };
}

/** Every display string, label and insight param value in the sheet. */
function collectDisplayStrings(sheet: Omit<FactsSheet, 'display_strings'>): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, key: string | null): void => {
    if (Array.isArray(value)) {
      for (const v of value) walk(v, null);
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    } else if (typeof value === 'string' && key !== null && (key === 'display' || key.startsWith('label_'))) {
      found.add(value);
    }
  };
  walk(sheet, null);
  for (const insight of sheet.candidate_insights) {
    for (const v of Object.values(insight.params)) if (typeof v === 'string') found.add(v);
  }
  return [...found];
}

function sumOf(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function buildWeekly(): FactsSheet {
  const now = '2026-10-11T19:30:00+03:00';
  const period = periodContaining('week', { year: 2026, month: 10, day: 5 }, { now });
  const previous = previousPeriod(period, { now });
  const first = parseIsoDate(period.start);

  const outs = [150_000, 95_000, 210_000, 120_000, 380_000, 220_000, 70_000];
  const ins = [0, 0, 0, 0, 4_500_000, 0, 0];
  const counts = [3, 2, 4, 3, 6, 3, 2];
  const daily = outs.map((o, i) => day(addDays(first, i), o, ins[i] ?? 0, counts[i] ?? 0));
  const out = sumOf(outs);
  const inTotal = sumOf(ins);

  const t = totals({ in: inTotal, out, fees: 23_800, transfers: 500_000, cash: 200_000, savings: 300_000, loans: 0, txCount: 23 });
  const pt = totals({ in: inTotal, out: 1_125_000, fees: 31_000, transfers: 300_000, cash: 0, savings: 300_000, loans: 0, txCount: 21 });

  const cats = categories(
    [
      { id: 'food', en: 'Food & groceries', sw: 'Chakula na mahitaji', out: 420_000, previous: 380_000, count: 6, top: 'Naivas' },
      { id: 'transport', en: 'Transport', sw: 'Usafiri', out: 310_000, previous: 330_000, count: 7, top: 'Uber' },
      { id: 'utilities', en: 'Bills & utilities', sw: 'Bili na huduma', out: 250_000, previous: 250_000, count: 1, top: 'KPLC PREPAID' },
      { id: 'eating_out', en: 'Eating out', sw: 'Kula nje', out: 120_000, previous: 60_000, count: 2, top: 'Java House' },
      { id: 'airtime', en: 'Airtime & data', sw: 'Muda wa maongezi na data', out: 95_000, previous: 95_000, count: 5, top: 'Safaricom' },
      { id: 'health', en: 'Health', sw: 'Afya', out: 50_000, previous: 10_000, count: 2, top: 'Goodlife Pharmacy' },
    ],
    out,
    period,
  );

  const spendiest = daily[4] ?? null;
  const weekendOut = (outs[5] ?? 0) + (outs[6] ?? 0);

  const candidates: CandidateInsight[] = [
    { id: 'ins_spend', kind: 'spend_vs_last', severity: 'notable', params: { out: t.out.display, previous_out: pt.out.display, delta: delta(out, 1_125_000).display, delta_pct: delta(out, 1_125_000).pct.display, direction: 'up' }, drilldown: drill(period, { direction: 'out' }) },
    { id: 'ins_top', kind: 'top_category', severity: 'info', params: { category_id: 'food', category_en: 'Food & groceries', category_sw: 'Chakula na mahitaji', out: 'KSh 4,200', share: '34%' }, drilldown: drill(period, { category_id: 'food' }) },
    { id: 'ins_big', kind: 'biggest_transaction', severity: 'info', params: { amount: 'KSh 2,500', counterparty: 'KPLC PREPAID', date: '2026-10-06', category_id: 'utilities' }, drilldown: drill(period, { transaction_ids: ['tx_kplc'] }) },
    { id: 'ins_new', kind: 'new_merchant', severity: 'info', params: { merchant: 'Java House', out: 'KSh 1,200', count: '2' }, drilldown: drill(period, { merchant: 'Java House' }) },
    { id: 'ins_fees', kind: 'fees_total', severity: 'notable', params: { fees: t.fees.display, fee_ratio: t.fee_ratio.display, count: '9' }, drilldown: drill(period, { types: ['FEE'] }) },
    { id: 'ins_sub', kind: 'subscription_due', severity: 'important', params: { merchant: 'Netflix', amount: 'KSh 1,100', next_expected: '2026-10-15' }, drilldown: drill(period, { merchant: 'Netflix' }) },
    { id: 'ins_day', kind: 'spendiest_day', severity: 'info', params: { weekday_en: 'Friday', weekday_sw: 'Ijumaa', date: '2026-10-09', out: 'KSh 3,800' }, drilldown: drill(period) },
    { id: 'ins_weekend', kind: 'weekend_share', severity: 'info', params: { share: pct(ratioPct(weekendOut, out)).display, weekend_out: money(weekendOut).display, weekday_out: money(out - weekendOut).display }, drilldown: drill(period) },
    { id: 'ins_fuliza', kind: 'fuliza_usage', severity: 'notable', params: { drawdown: 'KSh 500', repaid: 'KSh 500', cost: 'KSh 15', days: '1' }, drilldown: drill(period, { types: ['FULIZA_DRAWDOWN', 'FULIZA_REPAY'] }) },
    { id: 'ins_unknown', kind: 'unknown_messages', severity: 'info', params: { count: '3' }, drilldown: drill(period) },
  ];

  const sheet: Omit<FactsSheet, 'display_strings'> = {
    version: '1',
    generated_at: now,
    user: { locale: 'en', week_start: 'monday', display_name: 'Wanjiru' },
    period,
    previous_period: previous,
    totals: t,
    previous_totals: pt,
    deltas: { out: delta(out, 1_125_000), in: delta(inTotal, inTotal), fees: delta(23_800, 31_000), net: delta(inTotal - out, inTotal - 1_125_000) },
    categories: cats,
    merchants: [
      { name: 'KPLC PREPAID', category_id: 'utilities', out: money(250_000), count: count(1), is_new: false, drilldown: drill(period, { merchant: 'KPLC PREPAID' }) },
      { name: 'Naivas', category_id: 'food', out: money(260_000), count: count(3), is_new: false, drilldown: drill(period, { merchant: 'Naivas' }) },
      { name: 'Uber', category_id: 'transport', out: money(180_000), count: count(4), is_new: false, drilldown: drill(period, { merchant: 'Uber' }) },
      { name: 'Carrefour', category_id: 'food', out: money(160_000), count: count(2), is_new: false, drilldown: drill(period, { merchant: 'Carrefour' }) },
      { name: 'Java House', category_id: 'eating_out', out: money(120_000), count: count(2), is_new: true, drilldown: drill(period, { merchant: 'Java House' }) },
      { name: 'Safaricom', category_id: 'airtime', out: money(95_000), count: count(5), is_new: false, drilldown: drill(period, { merchant: 'Safaricom' }) },
    ].sort((a, b) => b.out.cents - a.out.cents),
    people: [
      { name: 'JOHN KAMAU', ref_masked: '07XXXXX123', sent: money(500_000), received: money(0), count: count(2), drilldown: drill(period, { counterparty_ref: 'p_john' }) },
    ],
    accounts: [
      { account_ref: 'acc_mpesa', label: 'M-Pesa', provider: 'mpesa', balance: money(832_000), balance_at: '2026-10-11T18:02:00+03:00', in: money(4_500_000), out: money(1_045_000), fees: money(23_800), balance_series: [{ at: '2026-10-05T08:00:00+03:00', cents: 300_000 }, { at: '2026-10-11T18:02:00+03:00', cents: 832_000 }] },
      { account_ref: 'acc_equity', label: 'Equity 4521', provider: 'bank', balance: null, balance_at: null, in: money(0), out: money(200_000), fees: money(0), balance_series: [] },
    ],
    daily,
    average_daily_out: money(Math.round(out / 7)),
    spendiest_day: spendiest,
    weekday_weekend: { weekday_out: money(out - weekendOut), weekend_out: money(weekendOut), weekend_share: pct(ratioPct(weekendOut, out)) },
    time_of_day: [
      { bucket: 'morning', out: money(300_000), count: count(6) },
      { bucket: 'afternoon', out: money(500_000), count: count(8) },
      { bucket: 'evening', out: money(365_000), count: count(7) },
      { bucket: 'night', out: money(80_000), count: count(2) },
    ],
    largest: [
      { id: 'tx_kplc', occurred_at: '2026-10-06T09:12:00+03:00', amount: money(250_000), direction: 'out', counterparty: 'KPLC PREPAID', category_id: 'utilities', type: 'PAYBILL' },
      { id: 'tx_naivas', occurred_at: '2026-10-09T17:40:00+03:00', amount: money(150_000), direction: 'out', counterparty: 'Naivas', category_id: 'food', type: 'BUY_GOODS' },
    ],
    new_merchants: ['Java House'],
    recurring: [
      { merchant: 'Netflix', category_id: 'entertainment', cadence: 'monthly', typical_amount: money(110_000), last_paid: '2026-09-15', next_expected: '2026-10-15', confidence: 0.92, is_subscription: true, drilldown: drill(period, { merchant: 'Netflix' }) },
      { merchant: 'Uber', category_id: 'transport', cadence: 'weekly', typical_amount: money(45_000), last_paid: '2026-10-10', next_expected: '2026-10-17', confidence: 0.7, is_subscription: false, drilldown: drill(period, { merchant: 'Uber' }) },
    ],
    budgets: [
      { category_id: 'food', limit: money(1_500_000), spent: money(900_000), projected: money(2_500_000), used: pct(60), status: 'watch' },
      { category_id: 'transport', limit: money(1_000_000), spent: money(400_000), projected: money(1_000_000), used: pct(40), status: 'ok' },
    ],
    overdraft: { fuliza_drawdown: money(50_000), fuliza_repaid: money(50_000), fuliza_cost: money(1_500), days_in_overdraft: count(1) },
    income: [{ source: 'ACME LTD', kind: 'salary', in: money(4_500_000), count: count(1) }],
    trend_months: [],
    ytd: null,
    anomalies: [],
    late_arrivals: count(0),
    unknown_messages: count(3),
    candidate_insights: candidates,
  };
  return FactsSheetSchema.parse({ ...sheet, display_strings: collectDisplayStrings(sheet) });
}

function buildMonthly(): FactsSheet {
  const now = '2026-10-01T07:30:00+03:00';
  const period = periodContaining('month', { year: 2026, month: 9, day: 1 }, { now });
  const previous = previousPeriod(period, { now });
  const first = parseIsoDate(period.start);

  const outs = Array.from({ length: period.days }, (_, i) => 120_000 + ((i * 37) % 9) * 25_000 + (i % 7 >= 5 ? 90_000 : 0));
  const ins = Array.from({ length: period.days }, (_, i) => (i === 24 ? 18_500_000 : i === 9 ? 1_200_000 : 0));
  const daily = outs.map((o, i) => day(addDays(first, i), o, ins[i] ?? 0, 2 + (i % 4)));
  const out = sumOf(outs);
  const inTotal = sumOf(ins);
  const prevOut = Math.round(out * 0.94);

  const shares: [string, string, string, number, number, string | null][] = [
    ['food', 'Food & groceries', 'Chakula na mahitaji', 30, 28, 'Naivas'],
    ['transport', 'Transport', 'Usafiri', 22, 24, 'Uber'],
    ['utilities', 'Bills & utilities', 'Bili na huduma', 15, 15, 'KPLC PREPAID'],
    ['eating_out', 'Eating out', 'Kula nje', 12, 8, 'Java House'],
    ['airtime', 'Airtime & data', 'Muda wa maongezi na data', 8, 8, 'Safaricom'],
    ['health', 'Health', 'Afya', 5, 6, 'Goodlife Pharmacy'],
    ['entertainment', 'Entertainment', 'Burudani', 4, 5, 'Netflix'],
  ];
  const seeds: CategorySeed[] = shares.map(([id, en, sw, s, ps, top]) => ({
    id, en, sw, out: Math.floor((out * s) / 100), previous: Math.floor((prevOut * ps) / 100), count: 5, top,
  }));
  const allocated = sumOf(seeds.map((s) => s.out));
  const prevAllocated = sumOf(seeds.map((s) => s.previous));
  seeds.push({ id: 'shopping', en: 'Shopping', sw: 'Ununuzi', out: out - allocated, previous: prevOut - prevAllocated, count: 3, top: 'Carrefour' });
  const cats = categories(seeds, out, period);

  const fees = 61_500;
  const t = totals({ in: inTotal, out, fees, transfers: 2_500_000, cash: 1_200_000, savings: 1_300_000, loans: 0, txCount: 112 });
  const pt = totals({ in: 18_500_000, out: prevOut, fees: 82_000, transfers: 2_000_000, cash: 800_000, savings: 1_000_000, loans: 0, txCount: 104 });

  const months = Array.from({ length: 6 }, (_, i) => {
    const m = 4 + i;
    const o = i === 5 ? out : 4_000_000 + i * 150_000;
    const inn = i === 5 ? inTotal : 18_500_000;
    const f = i === 5 ? fees : 80_000;
    return {
      month: `2026-${String(m).padStart(2, '0')}`,
      label_en: `${monthNameEn(m)} 2026`,
      label_sw: `${monthNameSw(m)} 2026`,
      in: money(inn),
      out: money(o),
      fees: money(f),
      net: money(inn - o),
      is_current: i === 5,
    };
  });

  const spendiestIndex = outs.indexOf(Math.max(...outs));
  const spendiest = daily[spendiestIndex] ?? null;
  const weekendOut = sumOf(daily.filter((d) => d.weekday_en === 'Saturday' || d.weekday_en === 'Sunday').map((d) => d.out.cents));
  const eatingOut = cats.find((c) => c.category_id === 'eating_out');
  const dOut = delta(out, prevOut);

  const candidates: CandidateInsight[] = [
    { id: 'm_spend', kind: 'spend_vs_last', severity: 'notable', params: { out: t.out.display, previous_out: pt.out.display, delta: dOut.display, delta_pct: dOut.pct.display, direction: dOut.direction }, drilldown: drill(period) },
    { id: 'm_budget_over', kind: 'budget_over', severity: 'important', params: { category_id: 'eating_out', category_en: 'Eating out', category_sw: 'Kula nje', spent: eatingOut?.out.display ?? 'KSh 0', limit: 'KSh 5,000', used: pct(ratioPct(eatingOut?.out.cents ?? 0, 500_000)).display }, drilldown: drill(period, { category_id: 'eating_out' }) },
    { id: 'm_fees', kind: 'fees_total', severity: 'notable', params: { fees: t.fees.display, fee_ratio: t.fee_ratio.display, count: '31' }, drilldown: drill(period, { types: ['FEE'] }) },
    { id: 'm_fee_change', kind: 'fee_ratio_change', severity: 'info', params: { fee_ratio: t.fee_ratio.display, previous_fee_ratio: pt.fee_ratio.display, direction: 'down' }, drilldown: drill(period, { types: ['FEE'] }) },
    { id: 'm_rising', kind: 'category_rising', severity: 'notable', params: { category_id: 'eating_out', category_en: 'Eating out', category_sw: 'Kula nje', out: eatingOut?.out.display ?? 'KSh 0', delta: eatingOut?.delta.display ?? 'KSh 0', delta_pct: eatingOut?.delta.pct.display ?? '0%' }, drilldown: drill(period, { category_id: 'eating_out' }) },
    { id: 'm_falling', kind: 'category_falling', severity: 'info', params: { category_id: 'transport', category_en: 'Transport', category_sw: 'Usafiri', out: cats.find((c) => c.category_id === 'transport')?.out.display ?? 'KSh 0', delta: cats.find((c) => c.category_id === 'transport')?.delta.display ?? 'KSh 0', delta_pct: cats.find((c) => c.category_id === 'transport')?.delta.pct.display ?? '0%' }, drilldown: drill(period, { category_id: 'transport' }) },
    { id: 'm_savings', kind: 'savings_rate', severity: 'info', params: { rate: t.savings_rate.display, savings: t.savings_out.display, income: t.in.display }, drilldown: drill(period, { types: ['MSHWARI_DEPOSIT'] }) },
    { id: 'm_income', kind: 'income_received', severity: 'info', params: { income: t.in.display, count: '2', top_source: 'ACME LTD' }, drilldown: drill(period, { direction: 'in' }) },
    { id: 'm_recurring', kind: 'recurring_found', severity: 'info', params: { merchant: 'Zuku Fibre', amount: 'KSh 4,100', cadence: 'monthly' }, drilldown: drill(period, { merchant: 'Zuku Fibre' }) },
    { id: 'm_record', kind: 'personal_record', severity: 'notable', params: { metric: 'fees', value: t.fees.display, previous_record: 'KSh 690' }, drilldown: drill(period, { types: ['FEE'] }) },
    { id: 'm_dupe', kind: 'duplicate_payment', severity: 'important', params: { merchant: 'Carrefour', amount: 'KSh 3,450', count: '2' }, drilldown: drill(period, { transaction_ids: ['tx_c1', 'tx_c2'] }) },
    { id: 'm_cash', kind: 'cash_withdrawn', severity: 'info', params: { amount: t.cash_withdrawn.display, count: '4' }, drilldown: drill(period, { types: ['WITHDRAW'] }) },
    { id: 'm_people', kind: 'sent_to_people', severity: 'info', params: { total: t.transfers.display, count: '6', top_person: 'JOHN KAMAU', top_amount: 'KSh 10,000' }, drilldown: drill(period, { types: ['SEND_MONEY'] }) },
    { id: 'm_late', kind: 'late_night_spend', severity: 'info', params: { out: 'KSh 4,800', count: '3' }, drilldown: drill(period) },
    { id: 'm_balance', kind: 'balance_low', severity: 'notable', params: { account: 'M-Pesa', balance: 'KSh 320' }, drilldown: drill(period, { account_ref: 'acc_mpesa' }) },
  ];

  const sheet: Omit<FactsSheet, 'display_strings'> = {
    version: '1',
    generated_at: now,
    user: { locale: 'sw', week_start: 'monday', display_name: null },
    period,
    previous_period: previous,
    totals: t,
    previous_totals: pt,
    deltas: { out: dOut, in: delta(inTotal, 18_500_000), fees: delta(fees, 82_000), net: delta(inTotal - out, 18_500_000 - prevOut) },
    categories: cats,
    merchants: [
      { name: 'Naivas', category_id: 'food', out: money(1_050_000), count: count(9), is_new: false, drilldown: drill(period, { merchant: 'Naivas' }) },
      { name: 'Uber', category_id: 'transport', out: money(780_000), count: count(16), is_new: false, drilldown: drill(period, { merchant: 'Uber' }) },
      { name: 'KPLC PREPAID', category_id: 'utilities', out: money(500_000), count: count(2), is_new: false, drilldown: drill(period, { merchant: 'KPLC PREPAID' }) },
      { name: 'Zuku Fibre', category_id: 'utilities', out: money(410_000), count: count(1), is_new: true, drilldown: drill(period, { merchant: 'Zuku Fibre' }) },
      { name: 'Carrefour', category_id: 'shopping', out: money(345_000), count: count(3), is_new: false, drilldown: drill(period, { merchant: 'Carrefour' }) },
    ],
    people: [
      { name: 'JOHN KAMAU', ref_masked: '07XXXXX123', sent: money(1_000_000), received: money(0), count: count(3), drilldown: drill(period, { counterparty_ref: 'p_john' }) },
      { name: 'MARY ATIENO', ref_masked: '01XXXXX456', sent: money(800_000), received: money(200_000), count: count(3), drilldown: drill(period, { counterparty_ref: 'p_mary' }) },
    ],
    accounts: [
      { account_ref: 'acc_mpesa', label: 'M-Pesa', provider: 'mpesa', balance: money(32_000), balance_at: '2026-09-30T21:10:00+03:00', in: money(inTotal), out: money(out - 1_200_000), fees: money(fees), balance_series: [] },
      { account_ref: 'acc_equity', label: 'Equity 4521', provider: 'bank', balance: money(4_210_000), balance_at: '2026-09-30T08:00:00+03:00', in: money(0), out: money(1_200_000), fees: money(0), balance_series: [] },
    ],
    daily,
    average_daily_out: money(Math.round(out / period.days)),
    spendiest_day: spendiest,
    weekday_weekend: { weekday_out: money(out - weekendOut), weekend_out: money(weekendOut), weekend_share: pct(ratioPct(weekendOut, out)) },
    time_of_day: [
      { bucket: 'morning', out: money(Math.round(out * 0.25)), count: count(28) },
      { bucket: 'afternoon', out: money(Math.round(out * 0.4)), count: count(44) },
      { bucket: 'evening', out: money(Math.round(out * 0.3)), count: count(33) },
      { bucket: 'night', out: money(out - Math.round(out * 0.25) - Math.round(out * 0.4) - Math.round(out * 0.3)), count: count(7) },
    ],
    largest: [
      { id: 'tx_rent', occurred_at: '2026-09-02T10:00:00+03:00', amount: money(500_000), direction: 'out', counterparty: 'KPLC PREPAID', category_id: 'utilities', type: 'PAYBILL' },
    ],
    new_merchants: ['Zuku Fibre'],
    recurring: [
      { merchant: 'Netflix', category_id: 'entertainment', cadence: 'monthly', typical_amount: money(110_000), last_paid: '2026-09-15', next_expected: '2026-10-15', confidence: 0.92, is_subscription: true, drilldown: drill(period, { merchant: 'Netflix' }) },
      { merchant: 'Zuku Fibre', category_id: 'utilities', cadence: 'monthly', typical_amount: money(410_000), last_paid: '2026-09-05', next_expected: '2026-10-05', confidence: 0.8, is_subscription: false, drilldown: drill(period, { merchant: 'Zuku Fibre' }) },
    ],
    budgets: [
      { category_id: 'eating_out', limit: money(500_000), spent: eatingOut?.out ?? money(0), projected: eatingOut?.out ?? money(0), used: pct(ratioPct(eatingOut?.out.cents ?? 0, 500_000)), status: 'over' },
      { category_id: 'food', limit: money(2_000_000), spent: cats.find((c) => c.category_id === 'food')?.out ?? money(0), projected: cats.find((c) => c.category_id === 'food')?.out ?? money(0), used: pct(ratioPct(cats.find((c) => c.category_id === 'food')?.out.cents ?? 0, 2_000_000)), status: 'watch' },
    ],
    overdraft: { fuliza_drawdown: money(0), fuliza_repaid: money(0), fuliza_cost: money(0), days_in_overdraft: count(0) },
    income: [
      { source: 'ACME LTD', kind: 'salary', in: money(18_500_000), count: count(1) },
      { source: 'MARY ATIENO', kind: 'person', in: money(1_200_000), count: count(1) },
    ],
    trend_months: months,
    ytd: null,
    anomalies: [{ kind: 'duplicate', transaction_ids: ['tx_c1', 'tx_c2'], params: { merchant: 'Carrefour', amount: 'KSh 3,450' } }],
    late_arrivals: count(2),
    unknown_messages: count(5),
    candidate_insights: candidates,
  };
  return FactsSheetSchema.parse({ ...sheet, display_strings: collectDisplayStrings(sheet) });
}

/** A validated weekly (5 to 11 October 2026) or monthly (September 2026) FactsSheet. */
export function sampleFacts(kind: Kind): FactsSheet {
  return kind === 'weekly' ? buildWeekly() : buildMonthly();
}

/** A copy of `facts` with extra display strings (for tests that add a value). */
export function withDisplayStrings(facts: FactsSheet, extra: string[]): FactsSheet {
  return { ...facts, display_strings: [...facts.display_strings, ...extra] };
}

/** The draft a well-behaved model would return for `doc`: no meta, identity fields or drill-downs. */
export function draftFromDocument(doc: ReportDocument): ReportDraft {
  return {
    period_label: doc.period_label,
    title: doc.title,
    sections: doc.sections.map((s) =>
      s.type === 'insights'
        ? { type: 'insights', title: s.title ?? null, items: s.items.map((i) => ({ insight_id: i.insight_id, headline: i.headline, body: i.body })) }
        : s,
    ),
    whatsapp: doc.whatsapp,
    email: doc.email,
  };
}
