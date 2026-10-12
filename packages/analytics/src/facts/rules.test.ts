/** Small hand-built ledgers for the rules the sample ledger does not exercise. */
import { describe, expect, it } from 'vitest';

import { FactsSheetSchema, type FactsSheet } from '../contracts/facts-sheet.js';
import type { Transaction } from '../contracts/transaction.js';
import { makeTransaction, sampleCategories, sampleFactsInput, SAMPLE_BANK, sampleId } from '../fixtures.js';
import { periodContaining } from '../period.js';
import { classify } from './classify.js';
import { computeFacts } from './compute.js';
import type { FactsInput } from './types.js';
import { divRound, medianCents } from './util.js';

const WEEK_NOW = '2026-09-28T07:00:00+03:00';
const at = (date: string, time = '12:00') => `${date}T${time}:00+03:00`;

function weekly(transactions: Transaction[], extra: Partial<FactsInput> = {}): FactsSheet {
  const sheet = computeFacts({
    user: { locale: 'sw', week_start: 'monday' },
    kind: 'weekly',
    period: periodContaining('week', { year: 2026, month: 9, day: 21 }, { now: WEEK_NOW }),
    transactions,
    accounts: [],
    categories: sampleCategories(),
    generated_at: WEEK_NOW,
    ...extra,
  });
  FactsSheetSchema.parse(sheet);
  return sheet;
}

const kinds = (s: FactsSheet) => s.candidate_insights.map((i) => i.kind);

describe('classification', () => {
  it('applies the precedence FEE > REVERSAL > loan drawdown > savings > loan repayment > transfer > direction', () => {
    expect(classify({ type: 'FEE', direction: 'out', is_transfer: true })).toBe('fee');
    expect(classify({ type: 'REVERSAL', direction: 'in', is_transfer: false })).toBe('reversal');
    expect(classify({ type: 'FULIZA_DRAWDOWN', direction: 'out', is_transfer: false })).toBe('loan_in');
    expect(classify({ type: 'MSHWARI_DEPOSIT', direction: 'out', is_transfer: true })).toBe('savings');
    expect(classify({ type: 'FULIZA_REPAY', direction: 'out', is_transfer: true })).toBe('loan_repayment');
    expect(classify({ type: 'MPESA_TO_BANK', direction: 'out', is_transfer: false })).toBe('transfer');
    expect(classify({ type: 'SEND_MONEY', direction: 'out', is_transfer: true })).toBe('transfer');
    expect(classify({ type: 'MSHWARI_WITHDRAW', direction: 'in', is_transfer: false })).toBe('transfer');
    expect(classify({ type: 'PAYBILL', direction: 'out', is_transfer: false })).toBe('spend');
    expect(classify({ type: 'RECEIVE_MONEY', direction: 'in', is_transfer: false })).toBe('income');
    expect(classify({ type: 'OTHER', direction: 'none', is_transfer: false })).toBe('other');
  });

  it('counts an unpaired inbound transfer once and a paired one only on its out leg', () => {
    const s = weekly([
      makeTransaction(1, { type: 'BANK_TO_MPESA', direction: 'in', amount_cents: 500_000, is_transfer: true }),
      makeTransaction(2, { type: 'MPESA_TO_BANK', direction: 'out', amount_cents: 200_000, transfer_pair_id: sampleId(3) }),
      makeTransaction(3, { type: 'MPESA_TO_BANK', direction: 'in', amount_cents: 200_000, transfer_pair_id: sampleId(2), account_ref: SAMPLE_BANK }),
    ]);
    expect(s.totals.transfers.cents).toBe(700_000);
    expect(s.totals.out.cents).toBe(0);
    expect(s.totals.in.cents).toBe(0);
  });

  it('ignores BALANCE_QUERY and FAILED rows everywhere', () => {
    const s = weekly([
      makeTransaction(1, { type: 'FAILED', amount_cents: 900_000, fee_cents: 1_000 }),
      makeTransaction(2, { type: 'BALANCE_QUERY', direction: 'none', amount_cents: 0, fee_cents: 500, balance_after_cents: 1 }),
    ]);
    expect(s.totals.transaction_count.value).toBe(0);
    expect(s.totals.fees.cents).toBe(0);
    expect(s.accounts).toEqual([]);
  });
});

describe('anomalies', () => {
  it('reports one balance break per inconsistent pair on the same account', () => {
    const s = weekly([
      makeTransaction(1, { occurred_at: at('2026-09-21', '08:00'), amount_cents: 10_000, balance_after_cents: 100_000 }),
      // expected 100,000 - 20,000 - 1,000 = 79,000; actual 70,000
      makeTransaction(2, { occurred_at: at('2026-09-21', '09:00'), amount_cents: 20_000, fee_cents: 1_000, balance_after_cents: 70_000 }),
      // in: 70,000 + 5,000 = 75,000 (consistent)
      makeTransaction(3, { occurred_at: at('2026-09-21', '10:00'), type: 'RECEIVE_MONEY', direction: 'in', amount_cents: 5_000, balance_after_cents: 75_000 }),
      // within KSh 1 is not a break
      makeTransaction(4, { occurred_at: at('2026-09-21', '11:00'), amount_cents: 5_000, balance_after_cents: 70_100 }),
      // no balance: the chain is broken, so the next pair is not compared
      makeTransaction(5, { occurred_at: at('2026-09-21', '12:00'), amount_cents: 5_000 }),
      makeTransaction(6, { occurred_at: at('2026-09-21', '13:00'), amount_cents: 5_000, balance_after_cents: 1 }),
    ], { accounts: [{ account_ref: 'mpesa:07XXXXX123', provider: 'mpesa', label: 'M-Pesa' }] });
    const breaks = s.anomalies.filter((a) => a.kind === 'balance_break');
    expect(breaks).toEqual([
      {
        kind: 'balance_break',
        transaction_ids: [sampleId(1), sampleId(2)],
        params: { account: 'M-Pesa', expected: 'KSh 790', actual: 'KSh 700', difference: 'KSh 90', date: '2026-09-21' },
      },
    ]);
    // The last balance is KSh 0.01: important low-balance insight first.
    expect(s.candidate_insights[0]?.id).toBe('balance_low:mpesa:07XXXXX123');
    expect(s.candidate_insights[0]?.params).toEqual({ account: 'M-Pesa', balance: 'KSh 0' });
  });

  it('groups three identical payments within an hour of each other into one duplicate', () => {
    const cp = { kind: 'paybill' as const, name: 'Zuku' };
    const s = weekly([
      makeTransaction(1, { occurred_at: at('2026-09-22', '10:00'), counterparty: cp, amount_cents: 300_000 }),
      makeTransaction(2, { occurred_at: at('2026-09-22', '10:50'), counterparty: { kind: 'paybill', name: ' ZUKU ' }, amount_cents: 300_000 }),
      makeTransaction(3, { occurred_at: at('2026-09-22', '11:45'), counterparty: cp, amount_cents: 300_000 }),
      makeTransaction(4, { occurred_at: at('2026-09-22', '13:00'), counterparty: cp, amount_cents: 300_000 }), // 75 minutes later
      makeTransaction(5, { occurred_at: at('2026-09-22', '11:00'), counterparty: cp, amount_cents: 300_100 }), // different amount
    ]);
    const dups = s.anomalies.filter((a) => a.kind === 'duplicate');
    expect(dups.map((d) => d.transaction_ids)).toEqual([[sampleId(1), sampleId(2), sampleId(3)]]);
    expect(dups[0]?.params).toMatchObject({ merchant: 'Zuku', amount: 'KSh 3,000', count: '3' });
  });

  it('does not flag fee spikes when the previous period had no fees', () => {
    const s = weekly([makeTransaction(1, { fee_cents: 50_000 })]);
    expect(s.anomalies.filter((a) => a.kind === 'fee_spike')).toEqual([]);
  });
});

describe('recurring', () => {
  it('detects a weekly payment and reports it as recurring_found when it is not a subscription', () => {
    const cp = { kind: 'till' as const, name: 'Mama Mboga' };
    const s = weekly([
      makeTransaction(1, { occurred_at: at('2026-08-31'), counterparty: cp, amount_cents: 50_000 }),
      makeTransaction(2, { occurred_at: at('2026-09-07'), counterparty: cp, amount_cents: 55_000 }),
      makeTransaction(3, { occurred_at: at('2026-09-14'), counterparty: cp, amount_cents: 45_000 }),
      makeTransaction(4, { occurred_at: at('2026-09-22'), counterparty: cp, amount_cents: 52_000 }),
      makeTransaction(5, { occurred_at: at('2026-09-23'), counterparty: cp, amount_cents: 200_000 }), // outside ±20%
    ]);
    expect(s.recurring).toHaveLength(1);
    const r = s.recurring[0];
    expect(r?.cadence).toBe('weekly');
    expect(r?.typical_amount.cents).toBe(51_000); // median of 450, 500, 520, 550 (KSh) = 510
    expect(r?.confidence).toBe(1); // gaps 7, 7, 8
    expect(r?.last_paid).toBe(at('2026-09-22'));
    expect(r?.next_expected).toBe(at('2026-09-29'));
    expect(r?.is_subscription).toBe(false);
    expect(s.candidate_insights.find((i) => i.kind === 'recurring_found')?.params).toEqual({ merchant: 'Mama Mboga', amount: 'KSh 510', cadence: 'weekly' });
  });

  it('needs at least three similar payments', () => {
    const cp = { kind: 'merchant' as const, name: 'Showmax' };
    const s = weekly([
      makeTransaction(1, { occurred_at: at('2026-08-21'), counterparty: cp, amount_cents: 30_000 }),
      makeTransaction(2, { occurred_at: at('2026-09-21'), counterparty: cp, amount_cents: 30_000 }),
    ]);
    expect(s.recurring).toEqual([]);
  });
});

describe('insights that need special ledgers', () => {
  it('skips biggest_transaction when the counterparty is unknown (params are never null)', () => {
    const s = weekly([makeTransaction(1, { type: 'AIRTIME', amount_cents: 50_000 })]);
    expect(s.largest[0]?.counterparty).toBeNull();
    expect(kinds(s)).not.toContain('biggest_transaction');
  });

  it('emits no_fees_week for a fee-free week with spending', () => {
    const s = weekly([makeTransaction(1, { amount_cents: 12_345 })]);
    expect(kinds(s)).toContain('no_fees_week');
    expect(s.candidate_insights.find((i) => i.kind === 'no_fees_week')?.params).toEqual({ out: 'KSh 123' });
  });

  it('emits fee_ratio_change when the fee ratio moves by two points or more', () => {
    const s = weekly([
      makeTransaction(1, { occurred_at: at('2026-09-15'), amount_cents: 100_000, fee_cents: 1_000 }), // 1%
      makeTransaction(2, { occurred_at: at('2026-09-22'), amount_cents: 100_000, fee_cents: 5_000 }), // 5%
    ]);
    const i = s.candidate_insights.find((x) => x.kind === 'fee_ratio_change');
    expect(i?.params).toEqual({ fee_ratio: '5%', previous_fee_ratio: '1%', direction: 'up' });
    expect(i?.severity).toBe('notable');
  });

  it('marks Fuliza as important when it cost KSh 200 or more, and caps overdraft days at days elapsed', () => {
    const now = '2026-09-23T10:00:00+03:00'; // Wednesday: three days elapsed
    const s = computeFacts({
      user: { locale: 'en', week_start: 'monday' },
      kind: 'weekly',
      period: periodContaining('week', { year: 2026, month: 9, day: 21 }, { now }),
      transactions: [makeTransaction(1, { type: 'FULIZA_DRAWDOWN', direction: 'in', occurred_at: at('2026-09-21'), amount_cents: 1_000_000, fee_cents: 20_000 })],
      accounts: [],
      categories: [],
      generated_at: now,
    });
    expect(s.overdraft.days_in_overdraft.value).toBe(3);
    expect(s.candidate_insights.find((i) => i.kind === 'fuliza_usage')?.severity).toBe('important');
  });

  it('projects an in-progress month and checks budgets against the projection', () => {
    const now = '2026-10-10T12:00:00+03:00';
    const s = computeFacts({
      user: { locale: 'en', week_start: 'monday' },
      kind: 'monthly',
      period: periodContaining('month', { year: 2026, month: 10, day: 1 }, { now }),
      transactions: [makeTransaction(1, { occurred_at: at('2026-10-05'), amount_cents: 1_000_000, category_id: 'transport' })],
      accounts: [],
      categories: sampleCategories(),
      budgets: [{ category_id: 'transport', limit_cents: 2_000_000, period: 'monthly' }],
      generated_at: now,
    });
    FactsSheetSchema.parse(s);
    expect(s.period.days_elapsed).toBe(10);
    // 10,000 x 31 / 10 = 31,000 > 20,000 limit: watch even though only half is used.
    expect(s.budgets[0]).toMatchObject({ projected: { cents: 3_100_000 }, used: { value: 50 }, status: 'watch' });
    expect(s.candidate_insights.find((i) => i.kind === 'month_projection')?.params).toEqual({
      projected: 'KSh 31,000', spent: 'KSh 10,000', days_elapsed: '10', days: '31',
    });
    expect(s.trend_months.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('only reports a personal record against a previous value above zero', () => {
    const s = weekly([makeTransaction(1, { amount_cents: 500_000 }), makeTransaction(2, { type: 'RECEIVE_MONEY', direction: 'in', amount_cents: 100 })], {
      previous_report_totals: { out_cents: 400_000, in_cents: 0, fees_cents: 0 },
    });
    expect(s.candidate_insights.filter((i) => i.kind === 'personal_record').map((i) => i.params.metric)).toEqual(['out']);
  });

  it('keeps categories that dropped to zero in category_falling', () => {
    const s = weekly([makeTransaction(1, { occurred_at: at('2026-09-15'), amount_cents: 100_000, category_id: 'transport' })]);
    expect(s.categories).toEqual([]);
    expect(s.candidate_insights.find((i) => i.kind === 'category_falling')?.params).toMatchObject({ category_id: 'transport', out: 'KSh 0', delta_pct: '-100%' });
  });
});

describe('people, income and names', () => {
  it('groups masked people without a name by their reference and classifies income sources', () => {
    const s = weekly([
      makeTransaction(1, { type: 'SEND_MONEY', counterparty: { kind: 'person', name: null, ref_masked: '07XXXXX999' }, amount_cents: 10_000 }),
      makeTransaction(2, { type: 'RECEIVE_MONEY', direction: 'in', counterparty: { kind: 'person', name: null, ref_masked: '07XXXXX999' }, amount_cents: 4_000 }),
      makeTransaction(3, { type: 'CREDIT', direction: 'in', counterparty: { kind: 'merchant', name: 'Jumia Refund' }, amount_cents: 3_000 }),
      makeTransaction(4, { type: 'CREDIT', direction: 'in', counterparty: { kind: 'paybill', name: 'Duka Sales' }, amount_cents: 2_000 }),
      makeTransaction(5, { type: 'CREDIT', direction: 'in', counterparty: { kind: 'unknown', name: null }, amount_cents: 1_000 }),
    ]);
    expect(s.people).toEqual([
      expect.objectContaining({ name: '07XXXXX999', ref_masked: '07XXXXX999', sent: { cents: 10_000, display: 'KSh 100' }, received: { cents: 4_000, display: 'KSh 40' } }),
    ]);
    expect(s.income.map((i) => [i.source, i.kind, i.in.cents])).toEqual([
      ['07XXXXX999', 'person', 4_000],
      ['Jumia Refund', 'refund', 3_000],
      ['Duka Sales', 'business', 2_000],
      ['Unknown', 'other', 1_000],
    ]);
  });

  it('falls back to the id for unknown categories and to Uncategorised / Bila kundi for none', () => {
    const s = weekly([
      makeTransaction(1, { amount_cents: 20_000, category_id: 'mystery' }),
      makeTransaction(2, { amount_cents: 10_000, category_id: null }),
    ], { categories: [] });
    expect(s.categories.map((c) => [c.category_id, c.name_en, c.name_sw])).toEqual([
      ['mystery', 'mystery', 'mystery'],
      ['uncategorised', 'Uncategorised', 'Bila kundi'],
    ]);
  });
});

describe('Sunday weeks', () => {
  it('compares against the previous Sunday-start week', () => {
    const now = '2026-09-28T07:00:00+03:00';
    const s = computeFacts({
      user: { locale: 'en', week_start: 'sunday' },
      kind: 'weekly',
      period: periodContaining('week', { year: 2026, month: 9, day: 21 }, { weekStart: 'sunday', now }),
      transactions: [makeTransaction(1, { occurred_at: at('2026-09-19'), amount_cents: 7_000 })], // Saturday
      accounts: [],
      categories: [],
      generated_at: now,
    });
    expect(s.period.start).toBe('2026-09-20T00:00:00+03:00');
    expect(s.previous_period.start).toBe('2026-09-13T00:00:00+03:00');
    expect(s.previous_totals.out.cents).toBe(7_000);
  });
});

describe('integer helpers', () => {
  it('divides with half-up rounding and takes integer medians', () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(4, 3)).toBe(1);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(1_680_000, 7)).toBe(240_000);
    expect(medianCents([3, 1, 2])).toBe(2);
    expect(medianCents([1, 2])).toBe(2);
    expect(medianCents([])).toBe(0);
    expect(() => divRound(1, 0)).toThrow(TypeError);
  });
});

describe('display names and what counts as a merchant', () => {
  it('normalises raw counterparty names for display', async () => {
    const { displayName } = await import('./classify.js');
    expect(displayName('NAIVAS LTD KILIMANI')).toBe('Naivas Kilimani');
    expect(displayName('KPLC PREPAID')).toBe('KPLC Prepaid');
    expect(displayName('QUICKMART LTD')).toBe('Quickmart');
    expect(displayName('MAKAO PROPERTIES')).toBe('Makao Properties');
    expect(displayName('M-PESA')).toBe('M-Pesa');
    expect(displayName('DSTV KENYA')).toBe('DSTV Kenya');
    expect(displayName('JOHN K')).toBe('John K');
    expect(displayName('Java House')).toBe('Java House');
    expect(displayName('AGENT 123456 KINOO')).toBe('Agent 123456 Kinoo');
    expect(displayName('  ')).toBeNull();
    expect(displayName(null)).toBeNull();
  });

  it('uses the caller-supplied canonical name everywhere it shows a name', () => {
    const cp = { kind: 'till' as const, name: 'NAIVAS LTD KILIMANI', till: '834501' };
    const sheet = computeFacts({
      ...sampleFactsInput('weekly'),
      transactions: [makeTransaction(1, { occurred_at: at('2026-09-22', '10:00'), counterparty: cp, amount_cents: 300_000 })],
      merchantName: (c) => (c.till === '834501' ? 'Naivas' : null),
    });
    expect(sheet.merchants.map((m) => m.name)).toEqual(['Naivas']);
    expect(sheet.largest[0]?.counterparty).toBe('Naivas');
    expect(sheet.candidate_insights.find((i) => i.kind === 'biggest_transaction')?.params['counterparty']).toBe('Naivas');
    expect(sheet.display_strings).toContain('Naivas');
  });

  it('keeps agent withdrawals, transfers and people out of merchants and largest', () => {
    const sheet = computeFacts({
      ...sampleFactsInput('weekly'),
      transactions: [
        makeTransaction(1, { type: 'WITHDRAW', occurred_at: at('2026-09-22', '10:00'), counterparty: { kind: 'agent', name: 'KASARANI AGENCIES LTD' }, amount_cents: 850_000 }),
        makeTransaction(2, { type: 'ATM', occurred_at: at('2026-09-22', '11:00'), counterparty: { kind: 'bank', name: 'EQUITY ATM' }, amount_cents: 500_000 }),
        makeTransaction(3, { type: 'SEND_MONEY', occurred_at: at('2026-09-22', '12:00'), counterparty: { kind: 'person', name: 'MARY W', ref_masked: '07XXXXX456' }, amount_cents: 200_000 }),
        makeTransaction(4, { type: 'MPESA_TO_BANK', occurred_at: at('2026-09-22', '13:00'), counterparty: { kind: 'bank', name: 'EQUITY BANK' }, amount_cents: 1_000_000, is_transfer: true }),
        makeTransaction(5, { type: 'BUY_GOODS', occurred_at: at('2026-09-22', '14:00'), counterparty: { kind: 'till', name: 'QUICKMART LTD' }, amount_cents: 120_000 }),
      ],
    });
    expect(sheet.merchants.map((m) => m.name)).toEqual(['Quickmart']);
    expect(sheet.largest.map((t) => t.counterparty)).toEqual(['Mary W', 'Quickmart']);
    expect(sheet.totals.cash_withdrawn.cents).toBe(1_350_000);
    expect(sheet.totals.transfers.cents).toBe(1_000_000);
    expect(sheet.people.map((p) => p.name)).toEqual(['Mary W']);
    expect(sheet.candidate_insights.find((i) => i.kind === 'cash_withdrawn')?.params).toEqual({ amount: 'KSh 13,500', count: '2' });
    expect(sheet.candidate_insights.find((i) => i.kind === 'biggest_transaction')?.params['counterparty']).toBe('Mary W');
  });
});
