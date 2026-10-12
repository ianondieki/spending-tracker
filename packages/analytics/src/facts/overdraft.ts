import type { FactsSheet, Period } from '../contracts/facts-sheet.js';
import { count, money, sumMinor } from '../money.js';
import { isoDate } from '../period.js';
import { periodDates } from './days.js';
import type { Tx } from './prepare.js';

export interface OverdraftRaw {
  readonly drawdown: number;
  readonly repaid: number;
  readonly cost: number;
  readonly days: number;
}

/**
 * Fuliza: drawdowns, repayments and the fees on both. Days in overdraft counts the Nairobi days of the period
 * (up to `days_elapsed`, so an in-progress period never counts the future) on which the running balance of
 * drawdowns minus repayments since the period start, floored at zero after every event, is above zero at the
 * end of the day.
 */
export function overdraftRaw(period: Period, periodTxs: readonly Tx[]): OverdraftRaw {
  const draws = periodTxs.filter((t) => t.src.type === 'FULIZA_DRAWDOWN');
  const repays = periodTxs.filter((t) => t.src.type === 'FULIZA_REPAY');
  const events = periodTxs.filter((t) => t.src.type === 'FULIZA_DRAWDOWN' || t.src.type === 'FULIZA_REPAY');
  let running = 0;
  let days = 0;
  let i = 0;
  const dates = periodDates(period).slice(0, Math.max(0, Math.min(period.days, period.days_elapsed)));
  for (const date of dates) {
    const key = isoDate(date);
    // Events are sorted; consume those on or before this date.
    while (i < events.length) {
      const e = events[i];
      if (!e || e.dateKey > key) break;
      running = Math.max(0, running + (e.src.type === 'FULIZA_DRAWDOWN' ? e.amount : -e.amount));
      i++;
    }
    if (running > 0) days++;
  }
  return {
    drawdown: sumMinor(draws.map((t) => t.amount)),
    repaid: sumMinor(repays.map((t) => t.amount)),
    cost: sumMinor([...draws, ...repays].map((t) => t.fee)),
    days,
  };
}

export function overdraftFact(r: OverdraftRaw): FactsSheet['overdraft'] {
  return {
    fuliza_drawdown: money(r.drawdown),
    fuliza_repaid: money(r.repaid),
    fuliza_cost: money(r.cost),
    days_in_overdraft: count(r.days),
  };
}
