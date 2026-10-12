/**
 * Anomaly candidates. Params hold display strings only (money, dates, names); the ids point at the rows.
 */
import type { Anomaly, Period } from '../contracts/facts-sheet.js';
import { count, formatMoney, sumMinor } from '../money.js';
import { isoDate } from '../period.js';
import { isMerchantTx } from './breakdowns.js';
import { periodDates } from './days.js';
import type { Tx } from './prepare.js';
import { divRound, groupBy, medianCents } from './util.js';

const HOUR_MS = 3_600_000;

export interface DuplicateFound {
  readonly txs: readonly Tx[];
  readonly merchant: string;
  readonly amount: number;
}

export interface UnusualFound {
  readonly tx: Tx;
  readonly merchant: string;
  readonly typical: number;
}

/** Two or more spending payments to the same normalised name for the same amount, each within an hour of the last. */
export function findDuplicates(periodSpend: readonly Tx[]): DuplicateFound[] {
  const found: DuplicateFound[] = [];
  for (const txs of groupBy(periodSpend, (t) => (t.key === null ? null : `${t.key}\u0000${t.amount}`)).values()) {
    let cluster: Tx[] = [];
    const flush = () => {
      const first = cluster[0];
      if (cluster.length >= 2 && first) found.push({ txs: cluster, merchant: first.name ?? '', amount: first.amount });
    };
    for (const t of txs) {
      const prev = cluster[cluster.length - 1];
      if (prev && t.ms - prev.ms <= HOUR_MS) cluster.push(t);
      else {
        flush();
        cluster = [t];
      }
    }
    flush();
  }
  return found.sort((a, b) => (a.txs[0]?.ms ?? 0) - (b.txs[0]?.ms ?? 0));
}

/** A period payment above three times the median of at least three earlier payments to that merchant. */
export function findUnusual(windowSpend: readonly Tx[], startMs: number): UnusualFound[] {
  const found: UnusualFound[] = [];
  for (const txs of groupBy(windowSpend.filter(isMerchantTx), (t) => t.key).values()) {
    const earlier: number[] = [];
    for (const t of txs) {
      if (t.ms >= startMs && earlier.length >= 3) {
        const typical = medianCents(earlier);
        if (typical > 0 && t.amount > 3 * typical) found.push({ tx: t, merchant: t.name ?? '', typical });
      }
      earlier.push(t.amount);
    }
  }
  return found.sort((a, b) => a.tx.ms - b.tx.ms);
}

export function buildAnomalies(args: {
  readonly period: Period;
  readonly periodTxs: readonly Tx[];
  readonly duplicates: readonly DuplicateFound[];
  readonly unusual: readonly UnusualFound[];
  readonly previousFees: number;
  readonly previousDays: number;
  readonly accountLabel: (ref: string) => string;
}): Anomaly[] {
  const { period, periodTxs } = args;
  const anomalies: Anomaly[] = [];

  for (const d of args.duplicates) {
    anomalies.push({
      kind: 'duplicate',
      transaction_ids: d.txs.map((t) => t.id),
      params: { merchant: d.merchant, amount: formatMoney(d.amount), count: count(d.txs.length).display, date: d.txs[0]?.dateKey ?? '' },
    });
  }

  for (const u of args.unusual) {
    anomalies.push({
      kind: 'unusual_amount',
      transaction_ids: [u.tx.id],
      params: { merchant: u.merchant, amount: formatMoney(u.tx.amount), typical: formatMoney(u.typical), date: u.tx.dateKey },
    });
  }

  for (const t of periodTxs) {
    if (t.src.type !== 'REVERSAL') continue;
    const params: Anomaly['params'] = { amount: formatMoney(t.amount), date: t.dateKey };
    const who = t.name ?? t.refMasked;
    if (who !== null) params.counterparty = who;
    anomalies.push({ kind: 'reversal', transaction_ids: [t.id], params });
  }

  if (args.previousFees > 0 && args.previousDays > 0) {
    const average = divRound(args.previousFees, args.previousDays);
    for (const date of periodDates(period)) {
      const key = isoDate(date);
      const day = periodTxs.filter((t) => t.dateKey === key && t.feeTotal > 0);
      const fees = sumMinor(day.map((t) => t.feeTotal));
      // fees > 3 x (previousFees / previousDays), kept in integers.
      if (fees * args.previousDays > 3 * args.previousFees) {
        anomalies.push({
          kind: 'fee_spike',
          transaction_ids: day.map((t) => t.id),
          params: { date: key, fees: formatMoney(fees), average: formatMoney(average) },
        });
      }
    }
  }

  for (const txs of groupBy(periodTxs, (t) => t.src.account_ref).values()) {
    for (let i = 1; i < txs.length; i++) {
      const a = txs[i - 1];
      const b = txs[i];
      if (!a || !b || a.balance === null || b.balance === null) continue;
      const dir = b.src.direction;
      const expected = dir === 'out' ? a.balance - b.amount - b.fee : dir === 'in' ? a.balance + b.amount : a.balance - b.fee;
      const diff = b.balance - expected;
      if (Math.abs(diff) > 100) {
        anomalies.push({
          kind: 'balance_break',
          transaction_ids: [a.id, b.id],
          params: {
            account: args.accountLabel(b.src.account_ref),
            expected: formatMoney(expected),
            actual: formatMoney(b.balance),
            difference: formatMoney(Math.abs(diff)),
            date: b.dateKey,
          },
        });
      }
    }
  }
  return anomalies;
}
