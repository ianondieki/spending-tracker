import type { Totals } from '../contracts/facts-sheet.js';
import { count, money, pct, ratioPct, sumMinor } from '../money.js';
import { CASH_TYPES } from './classify.js';
import type { Tx } from './prepare.js';

export interface RawTotals {
  readonly in: number;
  readonly out: number;
  readonly fees: number;
  readonly net: number;
  readonly transfers: number;
  readonly cash: number;
  readonly savings: number;
  readonly loanRepayments: number;
  readonly count: number;
}

export const isSpend = (t: Tx): boolean => t.cls === 'spend';
export const isIncome = (t: Tx): boolean => t.cls === 'income';

/**
 * A transfer is counted once: its out leg, plus any in (or none) leg that is not paired, so a bank-to-M-Pesa
 * move seen from both sides is not doubled while a move seen from one side still shows.
 */
export function transferAmount(t: Tx): number {
  if (t.cls !== 'transfer') return 0;
  if (t.src.direction === 'out' || !t.src.transfer_pair_id) return t.amount;
  return 0;
}

export function rawTotals(txs: readonly Tx[]): RawTotals {
  const inC = sumMinor(txs.filter(isIncome).map((t) => t.amount));
  const outC = sumMinor(txs.filter(isSpend).map((t) => t.amount));
  const fees = sumMinor(txs.map((t) => t.feeTotal));
  return {
    in: inC,
    out: outC,
    fees,
    net: sumMinor([inC, -outC, -fees]),
    transfers: sumMinor(txs.map(transferAmount)),
    cash: sumMinor(txs.filter((t) => t.cls === 'spend' && CASH_TYPES.has(t.src.type)).map((t) => t.amount)),
    savings: sumMinor(txs.filter((t) => t.cls === 'savings').map((t) => t.amount)),
    loanRepayments: sumMinor(txs.filter((t) => t.cls === 'loan_repayment').map((t) => t.amount)),
    count: txs.length,
  };
}

export function toTotals(r: RawTotals): Totals {
  return {
    in: money(r.in),
    out: money(r.out),
    fees: money(r.fees),
    net: money(r.net),
    transfers: money(r.transfers),
    cash_withdrawn: money(r.cash),
    savings_out: money(r.savings),
    loan_repayments: money(r.loanRepayments),
    transaction_count: count(r.count),
    fee_ratio: pct(ratioPct(r.fees, r.out)),
    savings_rate: pct(r.in === 0 ? 0 : ratioPct(r.savings, r.in)),
  };
}
