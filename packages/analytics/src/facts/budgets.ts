import type { BudgetFact, Period } from '../contracts/facts-sheet.js';
import { money, pct, ratioPct } from '../money.js';
import type { CategoryAgg } from './breakdowns.js';
import type { BudgetInput } from './types.js';
import { divRound, mulSafe } from './util.js';

/** Budgets whose period matches the report kind, in the order supplied. */
export function buildBudgets(
  budgets: readonly BudgetInput[],
  kind: 'weekly' | 'monthly',
  period: Period,
  categories: ReadonlyMap<string, CategoryAgg>,
): BudgetFact[] {
  return budgets
    .filter((b) => b.period === kind)
    .map((b) => {
      if (!Number.isSafeInteger(b.limit_cents)) throw new TypeError(`computeFacts: budget ${b.category_id} has an invalid limit`);
      const spent = categories.get(b.category_id)?.out ?? 0;
      const projected = period.days_elapsed > 0 ? divRound(mulSafe(spent, period.days), period.days_elapsed) : spent;
      const used = ratioPct(spent, b.limit_cents);
      const status: BudgetFact['status'] = spent > b.limit_cents ? 'over' : projected > b.limit_cents || used >= 80 ? 'watch' : 'ok';
      return { category_id: b.category_id, limit: money(b.limit_cents), spent: money(spent), projected: money(projected), used: pct(used), status };
    });
}
