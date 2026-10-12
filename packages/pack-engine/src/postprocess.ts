/**
 * Cross-pack post-processing from PROVIDER-PACKS.md: dedupe, transfer matching and the balance chain. Pure
 * functions over parsed transactions; nothing here alters an amount.
 */
import { deterministicUuid } from './hash.js';
import type { ParsedTransaction, Transaction } from './types.js';

export interface DedupeResult {
  readonly kept: ParsedTransaction[];
  readonly duplicates: number;
}

/** Dedupe key: `(provider, external_ref, family_id)` when a ref exists, else `raw_hash`. Duplicates are dropped and counted. */
export function dedupeKey(t: Transaction): string {
  return t.external_ref ? `${t.provider}|${t.external_ref}|${t.parser.family_id}` : `hash|${t.raw_hash}`;
}

export function dedupe(items: readonly ParsedTransaction[]): DedupeResult {
  const seen = new Set<string>();
  const kept: ParsedTransaction[] = [];
  let duplicates = 0;
  for (const item of items) {
    const key = dedupeKey(item.transaction);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    kept.push(item);
  }
  return { kept, duplicates };
}

const TEN_MINUTES_MS = 10 * 60 * 1000;
const NEVER_PAIRED = new Set(['WITHDRAW', 'ATM']);

export interface TransferPair {
  readonly transfer_pair_id: string;
  readonly out_id: string;
  readonly in_id: string;
}

/**
 * Pairs an `out` and an `in` from different accounts of the same user: equal amount, within 10 minutes, and at
 * least one side carries `is_transfer_hint` or has counterparty kind `self` or `bank`. Each transaction joins at
 * most one pair; the closest candidate in time wins. Mutates `is_transfer` and `transfer_pair_id` in place.
 */
export function matchTransfers(items: readonly ParsedTransaction[]): TransferPair[] {
  const sorted = [...items].sort((a, b) => time(a.transaction) - time(b.transaction));
  const paired = new Set<string>();
  const pairs: TransferPair[] = [];
  for (const a of sorted) {
    const ta = a.transaction;
    if (paired.has(ta.id) || ta.direction !== 'out' || NEVER_PAIRED.has(ta.type)) continue;
    let best: ParsedTransaction | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const b of sorted) {
      const tb = b.transaction;
      if (paired.has(tb.id) || tb.direction !== 'in' || NEVER_PAIRED.has(tb.type)) continue;
      if (tb.account_ref === ta.account_ref || tb.amount_cents !== ta.amount_cents) continue;
      const delta = Math.abs(time(tb) - time(ta));
      if (delta > TEN_MINUTES_MS) continue;
      if (!(a.is_transfer_hint || b.is_transfer_hint || isOwnSide(ta) || isOwnSide(tb))) continue;
      if (delta < bestDelta) {
        best = b;
        bestDelta = delta;
      }
    }
    if (!best) continue;
    const pairId = deterministicUuid(`transfer|${ta.id}|${best.transaction.id}`);
    ta.is_transfer = true;
    ta.transfer_pair_id = pairId;
    best.transaction.is_transfer = true;
    best.transaction.transfer_pair_id = pairId;
    paired.add(ta.id);
    paired.add(best.transaction.id);
    pairs.push({ transfer_pair_id: pairId, out_id: ta.id, in_id: best.transaction.id });
  }
  return pairs;
}

function isOwnSide(t: Transaction): boolean {
  return t.counterparty.kind === 'self' || t.counterparty.kind === 'bank';
}

function time(t: Transaction): number {
  return Date.parse(t.occurred_at);
}

export interface BalanceBreak {
  readonly account_ref: string;
  readonly transaction_id: string;
  readonly expected_cents: number;
  readonly actual_cents: number;
  readonly previous_transaction_id: string;
}

export interface BalanceChainResult {
  readonly checked: number;
  readonly breaks: BalanceBreak[];
}

/**
 * Per account, in time order: `prev.balance_after ± amount ∓ fee` must equal the next `balance_after`. A
 * transaction without a balance (a Fuliza drawdown, a bank alert without one) still moves the running balance.
 * Transactions that share an `external_ref` are one event: a Fuliza drawdown reuses the code of the payment it
 * funded and is applied before that payment's balance is checked, whatever order the two SMS arrived in.
 * Breaks are advisory (a possible missed message); they never alter a transaction.
 */
export function checkBalanceChain(items: readonly ParsedTransaction[]): BalanceChainResult {
  const byAccount = new Map<string, Transaction[]>();
  for (const item of items) {
    const list = byAccount.get(item.transaction.account_ref) ?? [];
    list.push(item.transaction);
    byAccount.set(item.transaction.account_ref, list);
  }
  const breaks: BalanceBreak[] = [];
  let checked = 0;
  for (const list of byAccount.values()) {
    const ordered = orderForChain(list);
    let running: number | null = null;
    let prevId: string | null = null;
    for (const t of ordered) {
      if (running !== null) {
        running = applyDelta(running, t);
        if (t.balance_after_cents !== null) {
          checked += 1;
          if (running !== t.balance_after_cents) {
            breaks.push({
              account_ref: t.account_ref,
              transaction_id: t.id,
              expected_cents: running,
              actual_cents: t.balance_after_cents,
              previous_transaction_id: prevId!,
            });
          }
        }
      }
      if (t.balance_after_cents !== null) {
        running = t.balance_after_cents;
        prevId = t.id;
      }
    }
  }
  return { checked, breaks };
}

/** Fees whose charge lands on the loan, not on the account the message belongs to. */
const FEE_NOT_FROM_ACCOUNT = new Set(['FULIZA_DRAWDOWN']);

function applyDelta(balance: number, t: Transaction): number {
  const fee = FEE_NOT_FROM_ACCOUNT.has(t.type) ? 0 : t.fee_cents;
  switch (t.direction) {
    case 'in':
      return balance + t.amount_cents - fee;
    case 'out':
      return balance - t.amount_cents - fee;
    default:
      return balance;
  }
}

/** Time order, with balance-less transactions that share a code moved ahead of their balance-carrying sibling. */
function orderForChain(list: readonly Transaction[]): Transaction[] {
  const sorted = [...list].sort(
    (a, b) => time(a) - time(b) || Date.parse(a.received_at) - Date.parse(b.received_at) || a.id.localeCompare(b.id),
  );
  const result: Transaction[] = [];
  const placed = new Set<string>();
  for (const t of sorted) {
    if (placed.has(t.id)) continue;
    if (t.external_ref && t.balance_after_cents !== null) {
      for (const sibling of sorted) {
        if (
          !placed.has(sibling.id) &&
          sibling.id !== t.id &&
          sibling.external_ref === t.external_ref &&
          sibling.balance_after_cents === null
        ) {
          result.push(sibling);
          placed.add(sibling.id);
        }
      }
    }
    result.push(t);
    placed.add(t.id);
  }
  return result;
}

export interface PostProcessResult {
  readonly transactions: Transaction[];
  readonly duplicates: number;
  readonly transfer_pairs: TransferPair[];
  readonly balance: BalanceChainResult;
}

/** Dedupe → transfer matching → balance chain, in that order. */
export function postProcess(items: readonly ParsedTransaction[]): PostProcessResult {
  const { kept, duplicates } = dedupe(items);
  const transfer_pairs = matchTransfers(kept);
  const balance = checkBalanceChain(kept);
  return { transactions: kept.map((k) => k.transaction), duplicates, transfer_pairs, balance };
}
