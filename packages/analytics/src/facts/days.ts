/** Daily series, weekday/weekend split, time-of-day buckets and the largest transactions. */
import type { DayFact, FactsSheet, Period, TimeOfDayFact, TxFact } from '../contracts/facts-sheet.js';
import { count, money, pct, ratioPct, sumMinor } from '../money.js';
import { isCashLike } from './classify.js';
import { addDays, isWeekend, isoDate, parseIsoDate, weekdayNameEn, weekdayNameSw, type LocalDate } from '../period.js';
import type { Tx } from './prepare.js';
import { isIncome, isSpend } from './totals.js';
import { divRound } from './util.js';

export interface DayRow {
  readonly date: LocalDate;
  readonly fact: DayFact;
  readonly out: number;
}

/** Every Nairobi date in the period, in order. */
export function periodDates(period: Period): LocalDate[] {
  const first = parseIsoDate(period.start);
  return Array.from({ length: period.days }, (_, i) => addDays(first, i));
}

/** One row per date in the period, zero rows included. `count` is every (non-ignored) transaction that day. */
export function buildDaily(period: Period, periodTxs: readonly Tx[]): DayRow[] {
  return periodDates(period).map((date) => {
    const key = isoDate(date);
    const day = periodTxs.filter((t) => t.dateKey === key);
    const out = sumMinor(day.filter(isSpend).map((t) => t.amount));
    return {
      date,
      out,
      fact: {
        date: key,
        weekday_en: weekdayNameEn(date),
        weekday_sw: weekdayNameSw(date),
        out: money(out),
        in: money(sumMinor(day.filter(isIncome).map((t) => t.amount))),
        count: count(day.length),
      },
    };
  });
}

/** The day with the most spending (earliest on a tie), or null when nothing was spent. */
export function spendiestDay(rows: readonly DayRow[]): DayRow | null {
  let best: DayRow | null = null;
  for (const row of rows) if (row.out > 0 && (best === null || row.out > best.out)) best = row;
  return best;
}

export function averageDailyOut(out: number, days: number): number {
  return days > 0 ? divRound(out, days) : 0;
}

export function weekdayWeekend(spend: readonly Tx[], totalOut: number): FactsSheet['weekday_weekend'] {
  const weekend = sumMinor(spend.filter((t) => isWeekend(t.local)).map((t) => t.amount));
  const weekday = sumMinor(spend.filter((t) => !isWeekend(t.local)).map((t) => t.amount));
  return { weekday_out: money(weekday), weekend_out: money(weekend), weekend_share: pct(ratioPct(weekend, totalOut)) };
}

export type Bucket = TimeOfDayFact['bucket'];
export const BUCKETS: readonly Bucket[] = ['morning', 'afternoon', 'evening', 'night'];

/** Nairobi hour to bucket: morning 05-11, afternoon 12-16, evening 17-20, night 21-04. */
export function bucketOf(hour: number): Bucket {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  return 'night';
}

export function timeOfDay(spend: readonly Tx[]): TimeOfDayFact[] {
  return BUCKETS.map((bucket) => {
    const txs = spend.filter((t) => bucketOf(t.hour) === bucket);
    return { bucket, out: money(sumMinor(txs.map((t) => t.amount))), count: count(txs.length) };
  });
}

export function txFact(t: Tx): TxFact {
  return {
    id: t.id,
    occurred_at: t.src.occurred_at,
    amount: money(t.amount),
    direction: t.src.direction,
    counterparty: t.name ?? t.refMasked,
    category_id: t.categoryId,
    type: t.src.type,
  };
}

/** Top five payments by amount (earlier first on a tie). Cash withdrawals are not payments to anyone and are left out. */
export function largest(spend: readonly Tx[]): Tx[] {
  return spend.filter((t) => !isCashLike(t)).sort((a, b) => b.amount - a.amount).slice(0, 5);
}
