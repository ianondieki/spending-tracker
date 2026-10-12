import { describe, expect, it } from 'vitest';

import { checkBalanceChain, dedupe, matchTransfers, postProcess } from './postprocess.js';
import type { ParsedTransaction, Transaction } from './types.js';

let seq = 0;
function tx(over: Partial<Transaction> & { amount_cents: number; direction: Transaction['direction'] }): Transaction {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    account_ref: 'mpesa:07XXXXX000',
    provider: 'mpesa',
    external_ref: null,
    type: 'PAYBILL',
    fee_cents: 0,
    balance_after_cents: null,
    occurred_at: '2026-01-15T09:00:00+03:00',
    received_at: '2026-01-15T09:00:00+03:00',
    counterparty: { name: null, kind: 'unknown', ref_masked: null, paybill: null, till: null, account_ref: null },
    category_id: null,
    category_source: 'none',
    category_confidence: 0,
    is_transfer: false,
    transfer_pair_id: null,
    parse_confidence: 0.95,
    source: 'sms',
    raw_hash: `hash${seq}`,
    parser: { pack_id: 'mpesa', pack_version: '0.1.0', family_id: 'paybill' },
    user_edited: false,
    note: null,
    tags: [],
    updated_at: '2026-01-15T09:00:00+03:00',
    ...over,
  };
}
const item = (transaction: Transaction, is_transfer_hint = false): ParsedTransaction => ({
  transaction,
  family_id: transaction.parser.family_id,
  is_transfer_hint,
});

describe('dedupe', () => {
  it('drops a repeat of the same code and family, keeps a Fuliza drawdown that reuses the code', () => {
    const pay = tx({ amount_cents: 2446000, direction: 'out', external_ref: 'IB225E1D06' });
    const again = tx({ amount_cents: 2446000, direction: 'out', external_ref: 'IB225E1D06', raw_hash: 'other-delivery' });
    const fuliza = tx({
      amount_cents: 496716,
      direction: 'in',
      external_ref: 'IB225E1D06',
      type: 'FULIZA_DRAWDOWN',
      parser: { pack_id: 'mpesa', pack_version: '0.1.0', family_id: 'fuliza_drawdown' },
    });
    const r = dedupe([item(pay), item(again), item(fuliza)]);
    expect(r.duplicates).toBe(1);
    expect(r.kept.map((k) => k.transaction.id)).toEqual([pay.id, fuliza.id]);
  });
  it('falls back to the raw hash when there is no code', () => {
    const a = tx({ amount_cents: 100, direction: 'out', raw_hash: 'same' });
    const b = tx({ amount_cents: 100, direction: 'out', raw_hash: 'same' });
    const c = tx({ amount_cents: 100, direction: 'out', raw_hash: 'different' });
    expect(dedupe([item(a), item(b), item(c)]).kept).toHaveLength(2);
  });
});

describe('transfer matching', () => {
  it('pairs a bank debit with a bank-to-M-PESA credit within 10 minutes', () => {
    const bankOut = tx({ amount_cents: 500000, direction: 'out', account_ref: 'bank:demo:***001', provider: 'bank', type: 'DEBIT', occurred_at: '2026-01-15T09:00:00+03:00' });
    const mpesaIn = tx({ amount_cents: 500000, direction: 'in', type: 'BANK_TO_MPESA', counterparty: { ...bankOut.counterparty, kind: 'bank' }, occurred_at: '2026-01-15T09:04:00+03:00' });
    const pairs = matchTransfers([item(mpesaIn, true), item(bankOut)]);
    expect(pairs).toHaveLength(1);
    expect(bankOut.is_transfer).toBe(true);
    expect(mpesaIn.transfer_pair_id).toBe(bankOut.transfer_pair_id);
  });
  it('does not pair across the same account, different amounts, beyond 10 minutes, without a hint, or withdrawals', () => {
    const base = { amount_cents: 1000, account_ref: 'a' } as const;
    const out1 = tx({ ...base, direction: 'out' });
    const inSame = tx({ ...base, direction: 'in' });
    expect(matchTransfers([item(out1, true), item(inSame, true)])).toHaveLength(0);
    const inOther = tx({ ...base, direction: 'in', account_ref: 'b', amount_cents: 1001 });
    expect(matchTransfers([item(out1, true), item(inOther, true)])).toHaveLength(0);
    const late = tx({ ...base, direction: 'in', account_ref: 'b', occurred_at: '2026-01-15T09:11:00+03:00' });
    expect(matchTransfers([item(out1, true), item(late, true)])).toHaveLength(0);
    const noHint = tx({ ...base, direction: 'in', account_ref: 'b' });
    expect(matchTransfers([item(out1), item(noHint)])).toHaveLength(0);
    const withdraw = tx({ ...base, direction: 'out', type: 'WITHDRAW' });
    expect(matchTransfers([item(withdraw, true), item(noHint, true)])).toHaveLength(0);
  });
  it('each transaction joins at most one pair and the closest in time wins', () => {
    const out1 = tx({ amount_cents: 1000, direction: 'out', account_ref: 'a', occurred_at: '2026-01-15T09:00:00+03:00' });
    const far = tx({ amount_cents: 1000, direction: 'in', account_ref: 'b', occurred_at: '2026-01-15T09:08:00+03:00' });
    const near = tx({ amount_cents: 1000, direction: 'in', account_ref: 'b', occurred_at: '2026-01-15T09:01:00+03:00' });
    const pairs = matchTransfers([item(out1, true), item(far, true), item(near, true)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.in_id).toBe(near.id);
    expect(far.is_transfer).toBe(false);
  });
});

describe('balance chain', () => {
  it('passes a consistent chain and flags a break', () => {
    const a = tx({ amount_cents: 100000, direction: 'in', balance_after_cents: 100000, occurred_at: '2026-01-15T09:00:00+03:00' });
    const b = tx({ amount_cents: 20000, direction: 'out', fee_cents: 700, balance_after_cents: 79300, occurred_at: '2026-01-15T09:10:00+03:00' });
    const c = tx({ amount_cents: 5000, direction: 'out', balance_after_cents: 70000, occurred_at: '2026-01-15T09:20:00+03:00' });
    const r = checkBalanceChain([item(c), item(a), item(b)]);
    expect(r.checked).toBe(2);
    expect(r.breaks).toHaveLength(1);
    expect(r.breaks[0]).toMatchObject({ transaction_id: c.id, expected_cents: 74300, actual_cents: 70000, previous_transaction_id: b.id });
  });
  it('applies a Fuliza drawdown (same code, no balance, fee on the loan) before the payment it funded', () => {
    const before = tx({ amount_cents: 100000, direction: 'in', balance_after_cents: 1949284, occurred_at: '2026-01-15T08:00:00+03:00' });
    const pay = tx({ amount_cents: 2446000, direction: 'out', fee_cents: 6700, external_ref: 'IB225E1D06', balance_after_cents: 0, occurred_at: '2026-01-15T12:34:00+03:00' });
    const fuliza = tx({ amount_cents: 503416, direction: 'in', fee_cents: 5034, external_ref: 'IB225E1D06', type: 'FULIZA_DRAWDOWN', occurred_at: '2026-01-15T12:34:05+03:00', received_at: '2026-01-15T12:34:05+03:00' });
    const r = checkBalanceChain([item(before), item(pay), item(fuliza)]);
    expect(r.breaks).toEqual([]);
    expect(r.checked).toBe(1);
  });
  it('keeps accounts separate', () => {
    const a = tx({ amount_cents: 100, direction: 'in', balance_after_cents: 100, account_ref: 'a' });
    const b = tx({ amount_cents: 100, direction: 'in', balance_after_cents: 999, account_ref: 'b', occurred_at: '2026-01-15T09:01:00+03:00' });
    expect(checkBalanceChain([item(a), item(b)]).breaks).toEqual([]);
  });
});

describe('postProcess', () => {
  it('runs dedupe, pairing and the chain together', () => {
    const out1 = tx({ amount_cents: 1000, direction: 'out', account_ref: 'a', external_ref: 'X1' });
    const dup = tx({ amount_cents: 1000, direction: 'out', account_ref: 'a', external_ref: 'X1' });
    const in1 = tx({ amount_cents: 1000, direction: 'in', account_ref: 'b' });
    const r = postProcess([item(out1, true), item(dup, true), item(in1)]);
    expect(r.duplicates).toBe(1);
    expect(r.transfer_pairs).toHaveLength(1);
    expect(r.transactions).toHaveLength(2);
  });
});
