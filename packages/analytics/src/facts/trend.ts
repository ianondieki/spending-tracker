import type { Period, TrendMonth } from '../contracts/facts-sheet.js';
import { money } from '../money.js';
import { addMonths, localMidnightMs, monthNameEn, monthNameSw, parseIsoDate } from '../period.js';
import { slice, type Tx } from './prepare.js';
import { rawTotals } from './totals.js';

export function shortMonthEn(month: number): string {
  return monthNameEn(month).slice(0, 3);
}
export function shortMonthSw(month: number): string {
  return monthNameSw(month).slice(0, 3);
}

/** The six calendar months ending with the report month, oldest first. */
export function trendMonths(period: Period, windowTxs: readonly Tx[]): TrendMonth[] {
  const reportMonth = parseIsoDate(period.start);
  const months: TrendMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const first = addMonths(reportMonth, -i);
    const next = addMonths(first, 1);
    const r = rawTotals(slice(windowTxs, localMidnightMs(first), localMidnightMs(next)));
    months.push({
      month: `${first.year}-${String(first.month).padStart(2, '0')}`,
      label_en: `${shortMonthEn(first.month)} ${first.year}`,
      label_sw: `${shortMonthSw(first.month)} ${first.year}`,
      in: money(r.in),
      out: money(r.out),
      fees: money(r.fees),
      net: money(r.net),
      is_current: i === 0,
    });
  }
  return months;
}

/** 1 January of the period's year up to period.end. */
export function ytdTxs(period: Period, windowTxs: readonly Tx[]): Tx[] {
  const first = parseIsoDate(period.start);
  return slice(windowTxs, localMidnightMs({ year: first.year, month: 1, day: 1 }), Date.parse(period.end));
}
