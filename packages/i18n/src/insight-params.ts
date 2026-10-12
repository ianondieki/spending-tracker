/**
 * The only params the analytics engine emits per candidate-insight kind. Every value is a display string or a
 * name (never a raw number). Insight templates may use exactly these placeholders; `renderInsight` throws on
 * anything else so a typo cannot ship. Keep in step with the engine (`@hesabu/analytics`).
 */
import type { InsightKind } from '@hesabu/analytics';

const CATEGORY = ['category_id', 'category_en', 'category_sw'] as const;

export const INSIGHT_PARAMS = {
  spend_vs_last: ['out', 'previous_out', 'delta', 'delta_pct', 'direction'],
  top_category: [...CATEGORY, 'out', 'share'],
  biggest_transaction: ['amount', 'counterparty', 'date', 'category_id'],
  new_merchant: ['merchant', 'out', 'count'],
  duplicate_payment: ['merchant', 'amount', 'count'],
  unusual_amount: ['merchant', 'amount', 'typical'],
  fees_total: ['fees', 'fee_ratio', 'count'],
  fee_ratio_change: ['fee_ratio', 'previous_fee_ratio', 'direction'],
  fuliza_usage: ['drawdown', 'repaid', 'cost', 'days'],
  cash_withdrawn: ['amount', 'count'],
  savings_rate: ['rate', 'savings', 'income'],
  income_received: ['income', 'count', 'top_source'],
  sent_to_people: ['total', 'count', 'top_person', 'top_amount'],
  spendiest_day: ['weekday_en', 'weekday_sw', 'date', 'out'],
  weekend_share: ['share', 'weekend_out', 'weekday_out'],
  late_night_spend: ['out', 'count'],
  budget_at_risk: [...CATEGORY, 'spent', 'limit', 'projected', 'used'],
  budget_over: [...CATEGORY, 'spent', 'limit', 'used'],
  subscription_due: ['merchant', 'amount', 'next_expected'],
  recurring_found: ['merchant', 'amount', 'cadence'],
  category_rising: [...CATEGORY, 'out', 'delta', 'delta_pct'],
  category_falling: [...CATEGORY, 'out', 'delta', 'delta_pct'],
  personal_record: ['metric', 'value', 'previous_record'],
  late_arrivals: ['count'],
  unknown_messages: ['count'],
  month_projection: ['projected', 'spent', 'days_elapsed', 'days'],
  balance_low: ['account', 'balance'],
  no_fees_week: ['out'],
} as const satisfies Record<InsightKind, readonly string[]>;

export type InsightParamName<K extends InsightKind> = (typeof INSIGHT_PARAMS)[K][number];

/** Params whose value picks a template variant (`variants` in the catalogue) and their allowed values. */
export const VARIANT_PARAM_VALUES: Readonly<Record<string, readonly string[]>> = {
  direction: ['up', 'down', 'flat', 'na'],
  cadence: ['weekly', 'monthly'],
  metric: ['out', 'in', 'fees'],
};
