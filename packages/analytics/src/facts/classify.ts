/**
 * Every transaction falls into exactly one class; the totals are sums over classes. Precedence (first match
 * wins): FEE, REVERSAL, Fuliza/M-Shwari loan drawdown, M-Shwari deposit (out), loan repayment, transfer,
 * then direction (out = spend, in = income, none = other). BALANCE_QUERY and FAILED never reach this point.
 */
import type { Transaction, TxType } from '../contracts/transaction.js';

export const IGNORED_TYPES: ReadonlySet<TxType> = new Set<TxType>(['BALANCE_QUERY', 'FAILED']);
export const TRANSFER_TYPES: ReadonlySet<TxType> = new Set<TxType>([
  'INTERNAL_TRANSFER', 'MPESA_TO_BANK', 'BANK_TO_MPESA', 'KCB_MPESA', 'MSHWARI_WITHDRAW',
]);
export const SAVINGS_TYPES: ReadonlySet<TxType> = new Set<TxType>(['MSHWARI_DEPOSIT']);
export const LOAN_REPAYMENT_TYPES: ReadonlySet<TxType> = new Set<TxType>(['FULIZA_REPAY', 'MSHWARI_LOAN_REPAY', 'LOAN_REPAY']);
export const LOAN_DRAWDOWN_TYPES: ReadonlySet<TxType> = new Set<TxType>(['FULIZA_DRAWDOWN', 'MSHWARI_LOAN']);
export const CASH_TYPES: ReadonlySet<TxType> = new Set<TxType>(['WITHDRAW', 'ATM']);
export const MERCHANT_KINDS: ReadonlySet<string> = new Set(['merchant', 'paybill', 'till', 'agent', 'bank']);

export type TxClass = 'spend' | 'income' | 'transfer' | 'savings' | 'loan_repayment' | 'loan_in' | 'fee' | 'reversal' | 'other';

export function isIgnored(t: Pick<Transaction, 'type'>): boolean {
  return IGNORED_TYPES.has(t.type);
}

export function isTransfer(t: Pick<Transaction, 'type' | 'is_transfer'>): boolean {
  return t.is_transfer || TRANSFER_TYPES.has(t.type);
}

export function classify(t: Pick<Transaction, 'type' | 'direction' | 'is_transfer'>): TxClass {
  if (t.type === 'FEE') return 'fee';
  if (t.type === 'REVERSAL') return 'reversal';
  if (LOAN_DRAWDOWN_TYPES.has(t.type)) return 'loan_in';
  if (SAVINGS_TYPES.has(t.type) && t.direction === 'out') return 'savings';
  if (LOAN_REPAYMENT_TYPES.has(t.type)) return 'loan_repayment';
  if (isTransfer(t)) return 'transfer';
  if (t.direction === 'out') return 'spend';
  if (t.direction === 'in') return 'income';
  return 'other';
}

/** Trim and collapse whitespace; null when nothing is left. This is the display form. */
export function cleanName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const cleaned = name.trim().replace(/\s+/g, ' ');
  return cleaned === '' ? null : cleaned;
}

/** Grouping key for counterparty names: cleaned and lower-cased. */
export function nameKey(name: string | null | undefined): string | null {
  const cleaned = cleanName(name);
  return cleaned === null ? null : cleaned.toLowerCase();
}
