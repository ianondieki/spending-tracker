/** Property tests: invariants that must hold for any ledger. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { FactsSheetSchema, type FactsSheet } from './contracts/facts-sheet.js';
import { COUNTERPARTY_KINDS, DIRECTIONS, TX_TYPES, type Transaction } from './contracts/transaction.js';
import { computeFacts } from './facts.js';
import { makeTransaction, sampleCategories } from './fixtures.js';
import { periodContaining, type LocalDate } from './period.js';
import type { FactsInput } from './facts/types.js';

const DAY_MS = 86_400_000;

const rowArb = fc.record({
  // Weighted toward ordinary spending so most runs have something to add up; every type still appears.
  type: fc.oneof(
    { arbitrary: fc.constantFrom('BUY_GOODS', 'PAYBILL', 'SEND_MONEY', 'WITHDRAW', 'CARD_PURCHASE', 'AIRTIME') as fc.Arbitrary<Transaction['type']>, weight: 3 },
    { arbitrary: fc.constantFrom(...TX_TYPES), weight: 2 },
  ),
  direction: fc.oneof({ arbitrary: fc.constant('out' as const), weight: 3 }, { arbitrary: fc.constantFrom(...DIRECTIONS), weight: 2 }),
  // Repeated amounts make duplicates, recurring payments and ties likely; the wide ranges cover the rest.
  amount: fc.oneof(
    fc.constantFrom(100_000, 101_000, 99_000, 50_000),
    fc.integer({ min: 0, max: 2_000_000 }),
    fc.integer({ min: 0, max: 5_000_000_000 }),
  ),
  fee: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 50_000 })),
  balance: fc.option(fc.integer({ min: -100_000, max: 50_000_000 }), { nil: null }),
  // Minutes relative to the period start: mostly inside the first month (so weekly periods see traffic), the
  // rest anywhere from about seven months before to six weeks after.
  offsetMin: fc.oneof(
    { arbitrary: fc.integer({ min: 0, max: 60 * 24 * 7 }), weight: 3 },
    { arbitrary: fc.integer({ min: -60 * 24 * 7, max: 60 * 24 * 31 }), weight: 2 },
    { arbitrary: fc.integer({ min: -60 * 24 * 215, max: 60 * 24 * 42 }), weight: 1 },
  ),
  name: fc.option(fc.constantFrom('Naivas', ' naivas  ', 'Java House', 'JANE W', 'Peter', 'KPLC PREPAID', 'Salary ACME', 'Refund Co'), { nil: null }),
  kind: fc.constantFrom(...COUNTERPARTY_KINDS),
  ref: fc.option(fc.constantFrom('07XXXXX111', '07XXXXX222'), { nil: null }),
  category: fc.option(fc.constantFrom('food_groceries', 'transport', 'eating_out', 'mystery'), { nil: null }),
  isTransfer: fc.boolean().chain((b) => (b ? fc.boolean() : fc.constant(false))), // true one time in four
  paired: fc.boolean(),
  account: fc.constantFrom('mpesa:07XXXXX123', 'bank:equity:***456', 'airtel:07XXXXX555'),
});

const inputArb = fc
  .record({
    kind: fc.constantFrom('weekly' as const, 'monthly' as const),
    weekStart: fc.constantFrom('monday' as const, 'sunday' as const),
    anchor: fc.record({ month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) }),
    nowOffsetDays: fc.integer({ min: -3, max: 40 }),
    rows: fc.array(rowArb, { maxLength: 80, size: 'medium' }),
    budgets: fc.array(
      fc.record({
        category_id: fc.constantFrom('food_groceries', 'transport', 'uncategorised'),
        limit_cents: fc.integer({ min: 0, max: 5_000_000 }),
        period: fc.constantFrom('weekly' as const, 'monthly' as const),
      }),
      { maxLength: 3 },
    ),
    late: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
    unknown: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
    record: fc.option(fc.record({ out_cents: fc.nat(10_000_000), in_cents: fc.nat(10_000_000), fees_cents: fc.nat(100_000) }), { nil: null }),
  })
  .map((r): FactsInput => {
    const anchor: LocalDate = { year: 2026, month: r.anchor.month, day: r.anchor.day };
    const pkind = r.kind === 'weekly' ? 'week' : 'month';
    const base = periodContaining(pkind, anchor, { weekStart: r.weekStart, now: 0 });
    const startMs = Date.parse(base.start);
    const generated_at = new Date(startMs + r.nowOffsetDays * DAY_MS).toISOString();
    const period = periodContaining(pkind, anchor, { weekStart: r.weekStart, now: generated_at });
    const transactions: Transaction[] = r.rows.map((row, i) =>
      makeTransaction(i + 1, {
        type: row.type,
        direction: row.direction,
        amount_cents: row.amount,
        fee_cents: row.fee,
        balance_after_cents: row.balance,
        occurred_at: new Date(startMs + row.offsetMin * 60_000).toISOString(),
        counterparty: { kind: row.kind, name: row.name, ref_masked: row.ref },
        category_id: row.category,
        is_transfer: row.isTransfer,
        transfer_pair_id: row.paired ? makeTransaction(10_000 + i).id : null,
        account_ref: row.account,
      }),
    );
    return {
      user: { locale: 'en', week_start: r.weekStart, display_name: null },
      kind: r.kind,
      period,
      transactions,
      accounts: [{ account_ref: 'mpesa:07XXXXX123', provider: 'mpesa', label: 'M-Pesa', last_balance_cents: 40_000 }],
      categories: sampleCategories(),
      budgets: r.budgets,
      late_arrival_count: r.late,
      unknown_message_count: r.unknown,
      generated_at,
      previous_report_totals: r.record,
    };
  });

const sum = (xs: readonly { cents: number }[]) => xs.reduce((s, x) => s + x.cents, 0);

function displays(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const x of node) displays(x, out);
  else if (typeof node === 'object' && node !== null) {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'display_strings') continue;
      if (k === 'display' && typeof v === 'string') out.push(v);
      else displays(v, out);
    }
  }
  return out;
}

const RUNS = { numRuns: 200 };

describe('facts engine properties', () => {
  it('never throws and always satisfies the contract', () => {
    fc.assert(fc.property(inputArb, (input) => {
      FactsSheetSchema.parse(computeFacts(input));
    }), RUNS);
  });

  it('adds up: totals.out = categories = daily = weekday + weekend = time of day = accounts', () => {
    fc.assert(fc.property(inputArb, (input) => {
      const s: FactsSheet = computeFacts(input);
      const out = s.totals.out.cents;
      expect(sum(s.categories.map((c) => c.out))).toBe(out);
      expect(sum(s.daily.map((d) => d.out))).toBe(out);
      expect(s.weekday_weekend.weekday_out.cents + s.weekday_weekend.weekend_out.cents).toBe(out);
      expect(sum(s.time_of_day.map((b) => b.out))).toBe(out);
      expect(sum(s.accounts.map((a) => a.out))).toBe(out);
      expect(sum(s.accounts.map((a) => a.fees))).toBe(s.totals.fees.cents);
      expect(sum(s.daily.map((d) => d.in))).toBe(s.totals.in.cents);
      expect(s.daily.reduce((n, d) => n + d.count.value, 0)).toBe(s.totals.transaction_count.value);
      expect(s.totals.net.cents).toBe(s.totals.in.cents - out - s.totals.fees.cents);
      expect(s.daily).toHaveLength(s.period.days);
      expect(s.time_of_day.map((b) => b.bucket)).toEqual(['morning', 'afternoon', 'evening', 'night']);
      if (out > 0) {
        const shares = s.categories.reduce((n, c) => n + c.share.value, 0);
        expect(Math.abs(shares - 100)).toBeLessThanOrEqual(s.categories.length);
      } else {
        expect(s.categories).toEqual([]);
        expect(s.spendiest_day).toBeNull();
      }
    }), RUNS);
  });

  it('lists every display value, label and string param in display_strings', () => {
    fc.assert(fc.property(inputArb, (input) => {
      const s = computeFacts(input);
      const allowed = new Set(s.display_strings);
      expect(allowed.size).toBe(s.display_strings.length);
      for (const d of displays(s)) expect(allowed.has(d)).toBe(true);
      expect(allowed.has(s.period.label_en) && allowed.has(s.previous_period.label_sw)).toBe(true);
      for (const p of [...s.candidate_insights.map((i) => i.params), ...s.anomalies.map((a) => a.params)]) {
        for (const v of Object.values(p)) {
          expect(typeof v === 'number').toBe(false);
          if (typeof v === 'string') expect(allowed.has(v)).toBe(true);
        }
      }
      // The i18n renderer fails closed on a missing value, so insight params are always non-empty strings.
      for (const i of s.candidate_insights) {
        for (const v of Object.values(i.params)) expect(typeof v === 'string' && v.length > 0).toBe(true);
      }
    }), RUNS);
  });

  it('is deterministic and independent of input order', () => {
    fc.assert(fc.property(inputArb, (input) => {
      const a = computeFacts(input);
      expect(computeFacts(input)).toEqual(a);
      expect(computeFacts({ ...input, transactions: [...input.transactions].reverse() })).toEqual(a);
    }), { numRuns: 100 });
  });

  it('orders insights by severity with unique ids', () => {
    const rank = { important: 0, notable: 1, info: 2 } as const;
    fc.assert(fc.property(inputArb, (input) => {
      const s = computeFacts(input);
      const ranks = s.candidate_insights.map((i) => rank[i.severity]);
      expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
      expect(new Set(s.candidate_insights.map((i) => i.id)).size).toBe(s.candidate_insights.length);
      expect(s.candidate_insights.some((i) => i.kind === 'spend_vs_last')).toBe(true);
    }), RUNS);
  });
});
