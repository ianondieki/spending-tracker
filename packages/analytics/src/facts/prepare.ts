/**
 * Validation and enrichment of the input window. Every later step works on `Tx`, sorted by time then id, so
 * the output does not depend on the order the caller supplied the transactions in.
 */
import type { Counterparty, CounterpartyKind, Transaction } from '../contracts/transaction.js';
import { isoDate, localHour, toLocalDate, type LocalDate } from '../period.js';
import { classify, cleanName, displayName, isIgnored, nameKey, type TxClass } from './classify.js';

export type NameOf = (counterparty: Counterparty) => string | null;

export const UNCATEGORISED = 'uncategorised';

export interface Tx {
  readonly src: Transaction;
  readonly id: string;
  readonly ms: number;
  readonly local: LocalDate;
  readonly dateKey: string;
  readonly hour: number;
  readonly cls: TxClass;
  readonly amount: number;
  readonly fee: number;
  /** fee_cents plus, for type FEE, the amount: this transaction's contribution to totals.fees. */
  readonly feeTotal: number;
  readonly balance: number | null;
  /** Display name of the counterparty (canonical or normalised) and its grouping key. */
  readonly name: string | null;
  readonly key: string | null;
  readonly cpKind: CounterpartyKind;
  readonly refMasked: string | null;
  /** The category id, `uncategorised` when the ledger has none. */
  readonly categoryId: string;
}

function assertCents(value: unknown, what: string, id: string, allowNegative = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new TypeError(`computeFacts: transaction ${id} has an invalid ${what}: ${String(value)}`);
  }
  return value;
}

export function compareTx(a: Tx, b: Tx): number {
  if (a.ms !== b.ms) return a.ms - b.ms;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Drops BALANCE_QUERY and FAILED rows and anything at or after `endMs`; fails closed (throws) on a row whose
 * money fields are not non-negative safe integers or whose time does not parse.
 */
export function prepare(transactions: readonly Transaction[], endMs: number, nameOf?: NameOf): Tx[] {
  const out: Tx[] = [];
  for (const t of transactions) {
    if (isIgnored(t)) continue;
    const ms = Date.parse(t.occurred_at);
    if (!Number.isFinite(ms)) throw new TypeError(`computeFacts: transaction ${t.id} has an invalid occurred_at`);
    if (ms >= endMs) continue;
    const amount = assertCents(t.amount_cents, 'amount_cents', t.id);
    const fee = assertCents(t.fee_cents, 'fee_cents', t.id);
    const balance = t.balance_after_cents == null ? null : assertCents(t.balance_after_cents, 'balance_after_cents', t.id, true);
    const local = toLocalDate(ms);
    const feeTotal = fee + (t.type === 'FEE' ? amount : 0);
    if (!Number.isSafeInteger(feeTotal)) throw new TypeError(`computeFacts: transaction ${t.id} fee overflows`);
    const name = cleanName(nameOf?.(t.counterparty)) ?? displayName(t.counterparty.name);
    out.push({
      src: t,
      id: t.id,
      ms,
      local,
      dateKey: isoDate(local),
      hour: localHour(ms),
      cls: classify(t),
      amount,
      fee,
      feeTotal,
      balance,
      name,
      key: nameKey(name),
      cpKind: t.counterparty.kind,
      refMasked: cleanName(t.counterparty.ref_masked),
      categoryId: t.category_id ?? UNCATEGORISED,
    });
  }
  return out.sort(compareTx);
}

/** Transactions with `startMs <= ms < endMs` (input sorted, output sorted). */
export function slice(txs: readonly Tx[], startMs: number, endMs: number): Tx[] {
  return txs.filter((t) => t.ms >= startMs && t.ms < endMs);
}
