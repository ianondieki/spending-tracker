/**
 * Hand-computed expectations for the sample ledger in fixtures.ts. Weekly report: Monday 21 to Sunday
 * 27 September 2026; previous week 14 to 20 September. Amounts below are in KSh; the engine works in cents.
 *
 * Report-week spending (direction out, not transfer/savings/loan repayment/FEE/reversal):
 *   Naivas 1,850 + Jane 2,000 + airtime 100 + Java House 2,100 + Carrefour 4,300 + KPLC 1,000 + KPLC 1,000
 *   + Kenchic 650 + agent withdrawal 3,000 + Peter 800 = 16,800
 * Fees: send 29 + Fuliza access 5 + withdrawal 69 + send 13 + bank FEE row 150 = 266
 * Income: Jane 700 + salary 85,000 = 85,700 (Fuliza 500, the transfer-in leg and the reversal are not income)
 * Previous week spending: 2,600 + 500 + 2,000 + 480 + 200 + 1,200 + 2,000 = 8,980; fees 29 + 52 = 81.
 */
import { describe, expect, it } from 'vitest';

import { FactsSheetSchema, type FactsSheet } from './contracts/facts-sheet.js';
import { computeFacts } from './facts.js';
import { sampleFactsInput, sampleFactsSheet, sampleId, sampleTransactions } from './fixtures.js';

const ksh = (n: number) => n * 100;
const cents = (m: { cents: number }) => m.cents;

function insight(sheet: FactsSheet, id: string) {
  const found = sheet.candidate_insights.find((i) => i.id === id);
  if (!found) throw new Error(`no insight ${id}; have ${sheet.candidate_insights.map((i) => i.id).join(', ')}`);
  return found;
}

describe('computeFacts on the weekly sample', () => {
  const sheet = sampleFactsSheet('weekly');

  it('validates against the frozen contract', () => {
    expect(() => FactsSheetSchema.parse(sheet)).not.toThrow();
    expect(sheet.version).toBe('1');
    expect(sheet.period.label_en).toBe('21 to 27 September 2026');
    expect(sheet.previous_period.label_en).toBe('14 to 20 September 2026');
    expect(sheet.user).toEqual({ locale: 'en', week_start: 'monday', display_name: 'Wanjiru' });
  });

  it('computes totals with transfers, savings, loans and reversals kept out of spending', () => {
    const t = sheet.totals;
    expect(cents(t.out)).toBe(ksh(16_800));
    expect(cents(t.in)).toBe(ksh(85_700));
    expect(cents(t.fees)).toBe(ksh(266));
    expect(cents(t.net)).toBe(ksh(85_700 - 16_800 - 266));
    expect(t.net.display).toBe('KSh 68,634');
    expect(cents(t.transfers)).toBe(ksh(10_000)); // the paired in-leg is not counted twice
    expect(cents(t.cash_withdrawn)).toBe(ksh(3_000));
    expect(cents(t.savings_out)).toBe(ksh(2_000));
    expect(cents(t.loan_repayments)).toBe(ksh(505));
    expect(t.transaction_count.value).toBe(19); // 20 rows in the week minus the balance query
    expect(t.fee_ratio).toEqual({ value: 2, display: '2%' }); // 266 / 16,800 = 1.58%
    expect(t.savings_rate).toEqual({ value: 2, display: '2%' }); // 2,000 / 85,700 = 2.33%
  });

  it('computes previous totals and deltas', () => {
    const p = sheet.previous_totals;
    expect(cents(p.out)).toBe(ksh(8_980));
    expect(cents(p.fees)).toBe(ksh(81));
    expect(cents(p.in)).toBe(0);
    expect(p.net.display).toBe('KSh -9,061');
    expect(p.transaction_count.value).toBe(7);
    expect(sheet.deltas.out).toEqual({ cents: ksh(7_820), display: 'KSh +7,820', pct: { value: 87, display: '87%' }, direction: 'up' });
    expect(sheet.deltas.in.direction).toBe('na');
    expect(sheet.deltas.fees.cents).toBe(ksh(185));
    expect(sheet.deltas.fees.pct.value).toBe(228);
    expect(sheet.deltas.net.cents).toBe(ksh(68_634 + 9_061));
  });

  it('breaks spending into categories with shares, deltas, counts and top merchants', () => {
    const rows = sheet.categories.map((c) => [c.category_id, cents(c.out) / 100, c.share.value, c.delta.cents / 100, c.delta.pct.value, c.delta.direction, c.count.value, c.top_merchant]);
    expect(rows).toEqual([
      ['shopping', 4_300, 26, 4_300, 0, 'na', 1, 'Carrefour Junction'],
      ['cash', 3_000, 18, 1_000, 50, 'up', 1, null],
      ['family_friends', 2_800, 17, 800, 40, 'up', 2, null],
      ['eating_out', 2_750, 16, 1_770, 181, 'up', 2, 'Java House'],
      ['utilities', 2_000, 12, 2_000, 0, 'na', 2, 'KPLC Prepaid'],
      ['food_groceries', 1_850, 11, -750, -29, 'down', 1, 'Naivas Kilimani'],
      ['airtime', 100, 1, -100, -50, 'down', 1, null],
    ]);
    const shopping = sheet.categories[0];
    expect(shopping?.name_en).toBe('Shopping');
    expect(shopping?.name_sw).toBe('Manunuzi');
    expect(shopping?.drilldown).toEqual({
      kind: 'transactions',
      filter: { from: '2026-09-21T00:00:00+03:00', to: '2026-09-28T00:00:00+03:00', category_id: 'shopping', direction: 'out' },
    });
  });

  it('lists merchants by spend and marks the ones never seen before the period', () => {
    expect(sheet.merchants.map((m) => [m.name, cents(m.out) / 100, m.count.value, m.is_new, m.category_id])).toEqual([
      ['Carrefour Junction', 4_300, 1, true, 'shopping'],
      ['Java House', 2_100, 1, false, 'eating_out'],
      ['KPLC Prepaid', 2_000, 2, false, 'utilities'],
      ['Naivas Kilimani', 1_850, 1, false, 'food_groceries'],
      ['Kenchic Inn', 650, 1, true, 'eating_out'],
    ]);
    expect(sheet.new_merchants).toEqual(['Carrefour Junction', 'Kenchic Inn']);
    expect(sheet.merchants[0]?.drilldown.filter).toEqual({
      from: '2026-09-21T00:00:00+03:00', to: '2026-09-28T00:00:00+03:00', merchant: 'Carrefour Junction',
    });
  });

  it('totals people sent to and received from', () => {
    expect(sheet.people.map((p) => [p.name, p.ref_masked, cents(p.sent) / 100, cents(p.received) / 100, p.count.value])).toEqual([
      ['Jane Wanjiku', '07XXXXX456', 2_000, 700, 2],
      ['Peter Otieno', '07XXXXX789', 800, 0, 1],
    ]);
    expect(sheet.people[0]?.drilldown.filter.counterparty_ref).toBe('07XXXXX456');
  });

  it('reports per-account movement and the last known balance', () => {
    const [mpesa, bank] = sheet.accounts;
    expect(sheet.accounts).toHaveLength(2);
    expect(mpesa?.label).toBe('M-Pesa');
    expect([mpesa?.in.cents, mpesa?.out.cents, mpesa?.fees.cents]).toEqual([ksh(700), ksh(12_500), ksh(116)]);
    expect(mpesa?.balance).toEqual({ cents: ksh(2_663), display: 'KSh 2,663' });
    expect(mpesa?.balance_at).toBe('2026-09-27T23:10:00+03:00');
    expect(mpesa?.balance_series).toHaveLength(14);
    expect(mpesa?.balance_series[0]).toEqual({ at: '2026-09-21T07:45:00+03:00', cents: ksh(3_729) });
    expect([bank?.in.cents, bank?.out.cents, bank?.fees.cents]).toEqual([ksh(85_000), ksh(4_300), ksh(150)]);
    expect(bank?.balance?.cents).toBe(ksh(95_550));
    expect(bank?.balance_series.map((b) => b.cents / 100)).toEqual([20_700, 105_700, 95_700, 95_550]);
  });

  it('builds a daily series with zero days, the average and the spendiest day', () => {
    expect(sheet.daily.map((d) => [d.date, d.weekday_en, cents(d.out) / 100, cents(d.in) / 100, d.count.value])).toEqual([
      ['2026-09-21', 'Monday', 3_850, 0, 2],
      ['2026-09-22', 'Tuesday', 2_200, 0, 3],
      ['2026-09-23', 'Wednesday', 4_300, 0, 1],
      ['2026-09-24', 'Thursday', 0, 700, 2],
      ['2026-09-25', 'Friday', 2_650, 85_000, 6],
      ['2026-09-26', 'Saturday', 3_000, 0, 3],
      ['2026-09-27', 'Sunday', 800, 0, 2],
    ]);
    expect(sheet.daily[2]?.weekday_sw).toBe('Jumatano');
    expect(sheet.average_daily_out).toEqual({ cents: ksh(2_400), display: 'KSh 2,400' });
    expect(sheet.spendiest_day?.date).toBe('2026-09-23');
    expect(cents(sheet.weekday_weekend.weekday_out)).toBe(ksh(13_000));
    expect(cents(sheet.weekday_weekend.weekend_out)).toBe(ksh(3_800));
    expect(sheet.weekday_weekend.weekend_share.value).toBe(23);
  });

  it('buckets spending by Nairobi time of day', () => {
    expect(sheet.time_of_day.map((b) => [b.bucket, cents(b.out) / 100, b.count.value])).toEqual([
      ['morning', 1_950, 2], // 07:45 Naivas, 08:30 airtime
      ['afternoon', 9_300, 3], // 13:10 Jane, 12:30 Carrefour, 12:00 withdrawal
      ['evening', 4_100, 3], // 18:40 Java House, 19:30 and 19:45 KPLC
      ['night', 1_450, 2], // 21:30 Kenchic, 23:10 Peter
    ]);
  });

  it('lists the five largest payments (cash withdrawals are not payments to anyone)', () => {
    expect(sheet.largest.map((t) => [t.counterparty, cents(t.amount) / 100, t.type, t.category_id])).toEqual([
      ['Carrefour Junction', 4_300, 'CARD_PURCHASE', 'shopping'],
      ['Java House', 2_100, 'BUY_GOODS', 'eating_out'],
      ['Jane Wanjiku', 2_000, 'SEND_MONEY', 'family_friends'],
      ['Naivas Kilimani', 1_850, 'BUY_GOODS', 'food_groceries'],
      ['KPLC Prepaid', 1_000, 'PAYBILL', 'utilities'],
    ]);
    expect(sheet.largest[0]?.id).toBe(sampleId(25));
  });

  it('finds recurring payments and subscriptions across the window', () => {
    expect(sheet.recurring.map((r) => [r.merchant, r.cadence, cents(r.typical_amount) / 100, r.next_expected, r.confidence, r.is_subscription])).toEqual([
      ['Safaricom Home Fibre', 'monthly', 2_999, '2026-10-01T09:10:00+03:00', 1, true],
      ['Netflix', 'monthly', 1_100, '2026-10-05T20:00:00+03:00', 1, true],
      // 450, 500, 480 are within 20% of the median 490 (the 2,100 is not); gaps 8 and 1 days: irregular.
      ['Java House', 'irregular', 480, null, 0, false],
    ]);
    expect(sheet.recurring[0]?.last_paid).toBe('2026-09-01T09:10:00+03:00');
    expect(sheet.recurring[0]?.drilldown.filter.transaction_ids).toEqual([sampleId(1), sampleId(3), sampleId(8)]);
  });

  it('checks weekly budgets and ignores monthly ones', () => {
    expect(sheet.budgets.map((b) => [b.category_id, cents(b.limit) / 100, cents(b.spent) / 100, cents(b.projected) / 100, b.used.value, b.status])).toEqual([
      ['eating_out', 2_500, 2_750, 2_750, 110, 'over'],
      ['family_friends', 3_000, 2_800, 2_800, 93, 'watch'],
      ['food_groceries', 3_000, 1_850, 1_850, 62, 'ok'],
    ]);
  });

  it('measures Fuliza use and overdraft days', () => {
    expect(sheet.overdraft.fuliza_drawdown.cents).toBe(ksh(500));
    expect(sheet.overdraft.fuliza_repaid.cents).toBe(ksh(505));
    expect(sheet.overdraft.fuliza_cost.cents).toBe(ksh(5));
    // Drawn Tuesday, repaid Thursday morning: Tuesday and Wednesday end in overdraft.
    expect(sheet.overdraft.days_in_overdraft.value).toBe(2);
  });

  it('groups income by source and kind', () => {
    expect(sheet.income.map((i) => [i.source, i.kind, cents(i.in) / 100, i.count.value])).toEqual([
      ['Acme Ltd Salary', 'salary', 85_000, 1],
      ['Jane Wanjiku', 'person', 700, 1],
    ]);
  });

  it('flags the duplicate, the unusual amount, the reversal and the fee spike', () => {
    expect(sheet.anomalies).toEqual([
      { kind: 'duplicate', transaction_ids: [sampleId(31), sampleId(32)], params: { merchant: 'KPLC Prepaid', amount: 'KSh 1,000', count: '2', date: '2026-09-25' } },
      { kind: 'unusual_amount', transaction_ids: [sampleId(24)], params: { merchant: 'Java House', amount: 'KSh 2,100', typical: 'KSh 480', date: '2026-09-22' } },
      { kind: 'reversal', transaction_ids: [sampleId(38)], params: { amount: 'KSh 1,000', date: '2026-09-27', counterparty: 'KPLC Prepaid' } },
      // Saturday fees 150 + 69 = 219 > 3 x (81 / 7); Monday's 29 is not.
      { kind: 'fee_spike', transaction_ids: [sampleId(34), sampleId(36)], params: { date: '2026-09-26', fees: 'KSh 219', average: 'KSh 12' } },
    ]);
  });

  it('counts late arrivals and unknown messages', () => {
    expect(sheet.late_arrivals.value).toBe(1);
    expect(sheet.unknown_messages.value).toBe(2);
    expect(sheet.trend_months).toEqual([]);
    expect(sheet.ytd).toBeNull();
  });

  it('emits the candidate insights that apply, important first', () => {
    expect(sheet.candidate_insights.map((i) => `${i.severity} ${i.id}`)).toEqual([
      `important duplicate_payment:${sampleId(31)}`,
      'important budget_over:eating_out',
      'notable spend_vs_last',
      `notable unusual_amount:${sampleId(24)}`,
      'notable fuliza_usage',
      'notable budget_at_risk:family_friends',
      'notable category_rising:eating_out',
      'notable category_rising:cash',
      'notable personal_record:out',
      'info top_category:shopping',
      `info biggest_transaction:${sampleId(25)}`,
      'info new_merchant:Carrefour Junction',
      'info new_merchant:Kenchic Inn',
      'info fees_total',
      'info cash_withdrawn',
      'info savings_rate',
      'info income_received',
      'info sent_to_people',
      'info spendiest_day:2026-09-23',
      'info weekend_share',
      'info late_night_spend',
      'info subscription_due:Safaricom Home Fibre', // due 1 October, inside 28 September to 4 October; Netflix (5 October) is not
      'info category_falling:transport',
      'info category_falling:food_groceries',
      'info late_arrivals',
      'info unknown_messages',
    ]);
  });

  it('fills insight params with display strings under the agreed names', () => {
    expect(insight(sheet, 'spend_vs_last').params).toEqual({
      out: 'KSh 16,800', previous_out: 'KSh 8,980', delta: 'KSh +7,820', delta_pct: '87%', direction: 'up',
    });
    expect(insight(sheet, 'top_category:shopping').params).toEqual({
      category_id: 'shopping', category_en: 'Shopping', category_sw: 'Manunuzi', out: 'KSh 4,300', share: '26%',
    });
    expect(insight(sheet, `biggest_transaction:${sampleId(25)}`).params).toEqual({
      amount: 'KSh 4,300', counterparty: 'Carrefour Junction', date: '2026-09-23', category_id: 'shopping',
    });
    expect(insight(sheet, 'new_merchant:Kenchic Inn').params).toEqual({ merchant: 'Kenchic Inn', out: 'KSh 650', count: '1' });
    expect(insight(sheet, `duplicate_payment:${sampleId(31)}`).params).toEqual({ merchant: 'KPLC Prepaid', amount: 'KSh 1,000', count: '2' });
    expect(insight(sheet, `unusual_amount:${sampleId(24)}`).params).toEqual({ merchant: 'Java House', amount: 'KSh 2,100', typical: 'KSh 480' });
    expect(insight(sheet, 'fees_total').params).toEqual({ fees: 'KSh 266', fee_ratio: '2%', count: '5' });
    expect(insight(sheet, 'fuliza_usage').params).toEqual({ drawdown: 'KSh 500', repaid: 'KSh 505', cost: 'KSh 5', days: '2' });
    expect(insight(sheet, 'cash_withdrawn').params).toEqual({ amount: 'KSh 3,000', count: '1' });
    expect(insight(sheet, 'savings_rate').params).toEqual({ rate: '2%', savings: 'KSh 2,000', income: 'KSh 85,700' });
    expect(insight(sheet, 'income_received').params).toEqual({ income: 'KSh 85,700', count: '2', top_source: 'Acme Ltd Salary' });
    expect(insight(sheet, 'sent_to_people').params).toEqual({ total: 'KSh 2,800', count: '2', top_person: 'Jane Wanjiku', top_amount: 'KSh 2,000' });
    expect(insight(sheet, 'spendiest_day:2026-09-23').params).toEqual({ weekday_en: 'Wednesday', weekday_sw: 'Jumatano', date: '2026-09-23', out: 'KSh 4,300' });
    expect(insight(sheet, 'weekend_share').params).toEqual({ share: '23%', weekend_out: 'KSh 3,800', weekday_out: 'KSh 13,000' });
    expect(insight(sheet, 'late_night_spend').params).toEqual({ out: 'KSh 1,450', count: '2' });
    expect(insight(sheet, 'budget_at_risk:family_friends').params).toEqual({
      category_id: 'family_friends', category_en: 'Family & friends', category_sw: 'Familia na marafiki',
      spent: 'KSh 2,800', limit: 'KSh 3,000', projected: 'KSh 2,800', used: '93%',
    });
    expect(insight(sheet, 'budget_over:eating_out').params).toEqual({
      category_id: 'eating_out', category_en: 'Eating out & drinks', category_sw: 'Kula nje na vinywaji',
      spent: 'KSh 2,750', limit: 'KSh 2,500', used: '110%',
    });
    expect(insight(sheet, 'subscription_due:Safaricom Home Fibre').params).toEqual({ merchant: 'Safaricom Home Fibre', amount: 'KSh 2,999', next_expected: '2026-10-01' });
    expect(insight(sheet, 'category_rising:eating_out').params).toMatchObject({ out: 'KSh 2,750', delta: 'KSh +1,770', delta_pct: '181%' });
    expect(insight(sheet, 'category_falling:transport').params).toMatchObject({ out: 'KSh 0', delta: 'KSh -1,200', delta_pct: '-100%' });
    expect(insight(sheet, 'personal_record:out').params).toEqual({ metric: 'out', value: 'KSh 16,800', previous_record: 'KSh 15,000' });
    expect(insight(sheet, 'late_arrivals').params).toEqual({ count: '1' });
    expect(insight(sheet, 'unknown_messages').params).toEqual({ count: '2' });
    expect(insight(sheet, `duplicate_payment:${sampleId(31)}`).drilldown.filter.transaction_ids).toEqual([sampleId(31), sampleId(32)]);
  });

  it('never puts a raw number in insight or anomaly params', () => {
    for (const p of [...sheet.candidate_insights.map((i) => i.params), ...sheet.anomalies.map((a) => a.params)]) {
      for (const v of Object.values(p)) expect(typeof v === 'string' || v === null).toBe(true);
    }
  });

  it('collects every display string, label and string param into display_strings', () => {
    const ds = new Set(sheet.display_strings);
    expect(ds.size).toBe(sheet.display_strings.length);
    for (const s of ['21 to 27 September 2026', '14 hadi 20 Septemba 2026', 'KSh 16,800', '87%', 'Jumatano', 'KSh 480', 'KSh 12', '2026-10-01']) {
      expect(ds.has(s)).toBe(true);
    }
    expect(sheet.display_strings[0]).toBe('21 to 27 September 2026');
  });
});

describe('computeFacts on the monthly sample (September 2026)', () => {
  const sheet = sampleFactsSheet('monthly');

  it('validates and computes month totals against August', () => {
    expect(() => FactsSheetSchema.parse(sheet)).not.toThrow();
    expect(sheet.period.label_en).toBe('September 2026');
    expect(sheet.previous_period.label_en).toBe('August 2026');
    // 16,800 + 8,980 + Safaricom Home 2,999 + Netflix 1,100 + Java House 450
    expect(cents(sheet.totals.out)).toBe(ksh(30_329));
    expect(cents(sheet.totals.fees)).toBe(ksh(347));
    expect(sheet.totals.transaction_count.value).toBe(29);
    // August: 2,999 + 1,100 + 2,400 + 1,500
    expect(cents(sheet.previous_totals.out)).toBe(ksh(7_999));
    expect(cents(sheet.previous_totals.in)).toBe(ksh(85_000));
    expect(sheet.daily).toHaveLength(30);
    expect(sheet.average_daily_out.display).toBe('KSh 1,011'); // 30,329 / 30 = 1,010.97
  });

  it('builds a six-month trend ending with the report month', () => {
    expect(sheet.trend_months.map((m) => [m.month, m.label_en, m.label_sw, cents(m.out) / 100, cents(m.in) / 100, m.is_current])).toEqual([
      ['2026-04', 'Apr 2026', 'Apr 2026', 0, 0, false],
      ['2026-05', 'May 2026', 'Mei 2026', 0, 0, false],
      ['2026-06', 'Jun 2026', 'Jun 2026', 0, 0, false],
      ['2026-07', 'Jul 2026', 'Jul 2026', 4_099, 0, false],
      ['2026-08', 'Aug 2026', 'Ago 2026', 7_999, 85_000, false],
      ['2026-09', 'Sep 2026', 'Sep 2026', 30_329, 85_700, true],
    ]);
    expect(sheet.trend_months[5]?.net).toEqual(sheet.totals.net);
  });

  it('computes year to date from 1 January', () => {
    expect(cents(sheet.ytd?.out ?? { cents: -1 })).toBe(ksh(30_329 + 7_999 + 4_099));
    expect(cents(sheet.ytd?.in ?? { cents: -1 })).toBe(ksh(170_700));
    expect(sheet.ytd?.transaction_count.value).toBe(36);
  });

  it('uses monthly budgets and lists both subscriptions due in October', () => {
    expect(sheet.budgets.map((b) => [b.category_id, b.used.value, b.status])).toEqual([
      ['shopping', 86, 'watch'],
      ['eating_out', 70, 'ok'],
    ]);
    const due = sheet.candidate_insights.filter((i) => i.kind === 'subscription_due').map((i) => i.params.next_expected);
    expect(due).toEqual(['2026-10-01', '2026-10-05']);
    expect(sheet.candidate_insights.some((i) => i.kind === 'month_projection')).toBe(false); // complete month
    expect(sheet.candidate_insights.some((i) => i.kind === 'no_fees_week')).toBe(false);
  });
});

describe('computeFacts edge cases', () => {
  it('handles an empty ledger: zeros everywhere and no crash', () => {
    for (const kind of ['weekly', 'monthly'] as const) {
      const sheet = computeFacts({ ...sampleFactsInput(kind), transactions: [], budgets: [], late_arrival_count: 0, unknown_message_count: 0, previous_report_totals: null });
      expect(() => FactsSheetSchema.parse(sheet)).not.toThrow();
      expect(sheet.totals.out.cents).toBe(0);
      expect(sheet.totals.transaction_count.value).toBe(0);
      expect(sheet.categories).toEqual([]);
      expect(sheet.spendiest_day).toBeNull();
      expect(sheet.average_daily_out.display).toBe('KSh 0');
      expect(sheet.daily.every((d) => d.out.cents === 0)).toBe(true);
      expect(sheet.time_of_day.map((b) => b.bucket)).toEqual(['morning', 'afternoon', 'evening', 'night']);
      expect(sheet.deltas.out.direction).toBe('flat');
      expect(sheet.candidate_insights.map((i) => i.kind)).toEqual(['spend_vs_last']);
      // Accounts are still listed, with the stored balance when the window has none.
      expect(sheet.accounts[1]?.balance?.display).toBe('KSh 25,000');
      expect(sheet.accounts[0]?.balance).toBeNull();
    }
  });

  it('does not depend on the order transactions arrive in', () => {
    const input = sampleFactsInput('weekly');
    const reversed = computeFacts({ ...input, transactions: [...sampleTransactions()].reverse() });
    expect(reversed).toEqual(computeFacts(input));
  });

  it('drops anything at or after period.end', () => {
    const input = sampleFactsInput('weekly');
    // The monthly window (to 1 October) has nothing more than the weekly one, so feed the weekly report a
    // monthly-length window by moving its end forward: totals must not change.
    const extra = sampleTransactions().map((t) => ({ ...t, id: t.id.replace('00000000-0000-4000', '00000000-0001-4000'), occurred_at: '2026-09-28T00:00:00+03:00' }));
    expect(computeFacts({ ...input, transactions: [...input.transactions, ...extra] }).totals).toEqual(computeFacts(input).totals);
  });

  it('fails closed on a period of the wrong kind and on invalid money', () => {
    const input = sampleFactsInput('weekly');
    expect(() => computeFacts({ ...input, kind: 'monthly' })).toThrow(TypeError);
    const bad = sampleTransactions();
    bad[0] = { ...bad[0]!, amount_cents: 12.5 };
    expect(() => computeFacts({ ...input, transactions: bad })).toThrow(/amount_cents/);
    const negative = sampleTransactions();
    negative[0] = { ...negative[0]!, fee_cents: -1 };
    expect(() => computeFacts({ ...input, transactions: negative })).toThrow(/fee_cents/);
  });
});
