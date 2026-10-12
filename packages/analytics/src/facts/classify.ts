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
/** Counterparty kinds that are a place you pay. Agents are cash points, people are people: neither is a merchant. */
export const MERCHANT_KINDS: ReadonlySet<string> = new Set(['merchant', 'paybill', 'till', 'bank']);

/** A cash withdrawal (by type or by counterparty kind): never a merchant payment, never "the largest payment to". */
export function isCashLike(t: { readonly src: Pick<Transaction, 'type'>; readonly cpKind: string }): boolean {
  return CASH_TYPES.has(t.src.type) || t.cpKind === 'agent';
}

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

/** Tokens dropped from merchant names (company suffixes) and tokens kept in capitals (known acronyms). */
const DROPPED_TOKENS: ReadonlySet<string> = new Set(['LTD', 'LTD.', 'LIMITED', 'PLC', 'INC', 'INC.', 'CO.']);
const ACRONYMS: ReadonlySet<string> = new Set([
  'KPLC', 'DSTV', 'GOTV', 'NHIF', 'SHA', 'NSSF', 'KRA', 'KCB', 'NCBA', 'CBD', 'ATM', 'SACCO', 'KQ', 'KWS', 'KPA', 'KWAL', 'NTSA',
  'TSC', 'KEMSA', 'UON', 'JKUAT', 'KU', 'MKU', 'USIU', 'HELB', 'NTV', 'KTN', 'TV', 'IT', 'ICT', 'HQ', 'II', 'III', 'IV', 'UK', 'US', 'USA', 'KE', 'EA',
]);

/**
 * Display normaliser for counterparty names: trims, drops company suffixes (LTD, LIMITED, PLC), title-cases words
 * and keeps known acronyms and tokens with digits. "NAIVAS LTD KILIMANI" → "Naivas Kilimani", "KPLC PREPAID" →
 * "KPLC Prepaid", "M-PESA" → "M-Pesa", "JOHN K" → "John K". Callers may supply a better (canonical) name instead.
 */
export function displayName(name: string | null | undefined): string | null {
  const cleaned = cleanName(name);
  if (cleaned === null) return null;
  const words = cleaned.split(' ').filter((w) => !DROPPED_TOKENS.has(w.toUpperCase()));
  if (words.length === 0) return cleaned;
  const cased = words.map((w) => {
    const upper = w.toUpperCase();
    if (ACRONYMS.has(upper) || /\d/.test(w)) return upper === w ? w : w;
    if (upper !== w) return w; // already mixed case: leave as typed
    return w
      .toLowerCase()
      .replace(/(^|[-'’/&.(])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
  });
  return cased.join(' ');
}

/** Grouping key for counterparty names: cleaned and lower-cased. */
export function nameKey(name: string | null | undefined): string | null {
  const cleaned = cleanName(name);
  return cleaned === null ? null : cleaned.toLowerCase();
}
