/**
 * Zod mirror of `contracts/facts-sheet.schema.json` (frozen). `@hesabu/analytics` produces this shape; the
 * writer, renderer and app consume it. Every money and percent value carries a display string.
 */
import { z } from 'zod';

export const MoneySchema = z.strictObject({ cents: z.number().int(), display: z.string() });
export type Money = z.infer<typeof MoneySchema>;

export const PctSchema = z.strictObject({ value: z.number().int(), display: z.string() });
export type Pct = z.infer<typeof PctSchema>;

export const CountSchema = z.strictObject({ value: z.number().int(), display: z.string() });
export type Count = z.infer<typeof CountSchema>;

export const DELTA_DIRECTIONS = ['up', 'down', 'flat', 'na'] as const;
export const DeltaSchema = z.strictObject({
  cents: z.number().int(),
  display: z.string(),
  pct: PctSchema,
  direction: z.enum(DELTA_DIRECTIONS),
});
export type Delta = z.infer<typeof DeltaSchema>;

export const DrilldownFilterSchema = z.strictObject({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  category_id: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  counterparty_ref: z.string().nullable().optional(),
  account_ref: z.string().nullable().optional(),
  direction: z.string().nullable().optional(),
  types: z.array(z.string()).optional(),
  transaction_ids: z.array(z.string()).optional(),
});
export const DrilldownSchema = z.strictObject({
  kind: z.literal('transactions'),
  filter: DrilldownFilterSchema,
});
export type Drilldown = z.infer<typeof DrilldownSchema>;

export const PeriodSchema = z.strictObject({
  kind: z.enum(['week', 'month']),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  label_en: z.string(),
  label_sw: z.string(),
  days: z.number().int(),
  days_elapsed: z.number().int(),
  timezone: z.literal('Africa/Nairobi'),
});
export type Period = z.infer<typeof PeriodSchema>;

export const TotalsSchema = z.strictObject({
  in: MoneySchema,
  out: MoneySchema,
  fees: MoneySchema,
  net: MoneySchema,
  transfers: MoneySchema,
  cash_withdrawn: MoneySchema,
  savings_out: MoneySchema,
  loan_repayments: MoneySchema,
  transaction_count: CountSchema,
  fee_ratio: PctSchema,
  savings_rate: PctSchema,
});
export type Totals = z.infer<typeof TotalsSchema>;

export const CategoryFactSchema = z.strictObject({
  category_id: z.string(),
  name_en: z.string(),
  name_sw: z.string(),
  out: MoneySchema,
  share: PctSchema,
  delta: DeltaSchema,
  count: CountSchema,
  top_merchant: z.string().nullable().optional(),
  drilldown: DrilldownSchema,
});
export type CategoryFact = z.infer<typeof CategoryFactSchema>;

export const MerchantFactSchema = z.strictObject({
  name: z.string(),
  category_id: z.string().nullable().optional(),
  out: MoneySchema,
  count: CountSchema,
  is_new: z.boolean(),
  drilldown: DrilldownSchema,
});
export type MerchantFact = z.infer<typeof MerchantFactSchema>;

export const PersonFactSchema = z.strictObject({
  name: z.string(),
  ref_masked: z.string().nullable().optional(),
  sent: MoneySchema,
  received: MoneySchema,
  count: CountSchema,
  drilldown: DrilldownSchema,
});
export type PersonFact = z.infer<typeof PersonFactSchema>;

export const AccountFactSchema = z.strictObject({
  account_ref: z.string(),
  label: z.string(),
  provider: z.string(),
  balance: MoneySchema.nullable(),
  balance_at: z.string().nullable(),
  in: MoneySchema,
  out: MoneySchema,
  fees: MoneySchema,
  balance_series: z.array(z.object({ at: z.string(), cents: z.number().int() })),
});
export type AccountFact = z.infer<typeof AccountFactSchema>;

export const DayFactSchema = z.strictObject({
  date: z.iso.date(),
  weekday_en: z.string(),
  weekday_sw: z.string(),
  out: MoneySchema,
  in: MoneySchema,
  count: CountSchema,
});
export type DayFact = z.infer<typeof DayFactSchema>;

export const TxFactSchema = z.strictObject({
  id: z.string(),
  occurred_at: z.string(),
  amount: MoneySchema,
  direction: z.string(),
  counterparty: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  type: z.string(),
});
export type TxFact = z.infer<typeof TxFactSchema>;

export const RecurringFactSchema = z.strictObject({
  merchant: z.string(),
  category_id: z.string().nullable().optional(),
  cadence: z.enum(['weekly', 'monthly', 'irregular']),
  typical_amount: MoneySchema,
  last_paid: z.string(),
  next_expected: z.string().nullable(),
  confidence: z.number(),
  is_subscription: z.boolean(),
  drilldown: DrilldownSchema,
});
export type RecurringFact = z.infer<typeof RecurringFactSchema>;

export const BudgetFactSchema = z.strictObject({
  category_id: z.string(),
  limit: MoneySchema,
  spent: MoneySchema,
  projected: MoneySchema,
  used: PctSchema,
  status: z.enum(['ok', 'watch', 'over']),
});
export type BudgetFact = z.infer<typeof BudgetFactSchema>;

export const INSIGHT_KINDS = [
  'spend_vs_last', 'top_category', 'biggest_transaction', 'new_merchant', 'duplicate_payment', 'unusual_amount',
  'fees_total', 'fee_ratio_change', 'fuliza_usage', 'cash_withdrawn', 'savings_rate', 'income_received',
  'sent_to_people', 'spendiest_day', 'weekend_share', 'late_night_spend', 'budget_at_risk', 'budget_over',
  'subscription_due', 'recurring_found', 'category_rising', 'category_falling', 'personal_record',
  'late_arrivals', 'unknown_messages', 'month_projection', 'balance_low', 'no_fees_week',
] as const;
export const InsightKindSchema = z.enum(INSIGHT_KINDS);
export type InsightKind = z.infer<typeof InsightKindSchema>;

export const INSIGHT_SEVERITIES = ['info', 'notable', 'important'] as const;
export const ParamValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type ParamValue = z.infer<typeof ParamValueSchema>;

export const CandidateInsightSchema = z.strictObject({
  id: z.string(),
  kind: InsightKindSchema,
  severity: z.enum(INSIGHT_SEVERITIES),
  params: z.record(z.string(), ParamValueSchema),
  drilldown: DrilldownSchema,
});
export type CandidateInsight = z.infer<typeof CandidateInsightSchema>;

export const TimeOfDaySchema = z.strictObject({
  bucket: z.enum(['morning', 'afternoon', 'evening', 'night']),
  out: MoneySchema,
  count: CountSchema,
});
export type TimeOfDayFact = z.infer<typeof TimeOfDaySchema>;

export const IncomeFactSchema = z.strictObject({
  source: z.string(),
  kind: z.enum(['salary', 'business', 'person', 'refund', 'other']),
  in: MoneySchema,
  count: CountSchema,
});
export type IncomeFact = z.infer<typeof IncomeFactSchema>;

export const TrendMonthSchema = z.strictObject({
  month: z.string(),
  label_en: z.string(),
  label_sw: z.string(),
  in: MoneySchema,
  out: MoneySchema,
  fees: MoneySchema,
  net: MoneySchema,
  is_current: z.boolean(),
});
export type TrendMonth = z.infer<typeof TrendMonthSchema>;

export const AnomalySchema = z.strictObject({
  kind: z.enum(['duplicate', 'unusual_amount', 'reversal', 'fee_spike', 'balance_break']),
  transaction_ids: z.array(z.string()),
  params: z.record(z.string(), ParamValueSchema),
});
export type Anomaly = z.infer<typeof AnomalySchema>;

export const FactsSheetSchema = z.strictObject({
  version: z.literal('1'),
  generated_at: z.iso.datetime({ offset: true }),
  user: z.strictObject({
    locale: z.enum(['en', 'sw']),
    week_start: z.string(),
    display_name: z.string().nullable().optional(),
  }),
  period: PeriodSchema,
  previous_period: PeriodSchema,
  totals: TotalsSchema,
  previous_totals: TotalsSchema,
  deltas: z.strictObject({ out: DeltaSchema, in: DeltaSchema, fees: DeltaSchema, net: DeltaSchema }),
  categories: z.array(CategoryFactSchema),
  merchants: z.array(MerchantFactSchema).max(15),
  people: z.array(PersonFactSchema).max(10),
  accounts: z.array(AccountFactSchema),
  daily: z.array(DayFactSchema),
  average_daily_out: MoneySchema,
  spendiest_day: DayFactSchema.nullable(),
  weekday_weekend: z.strictObject({ weekday_out: MoneySchema, weekend_out: MoneySchema, weekend_share: PctSchema }),
  time_of_day: z.array(TimeOfDaySchema),
  largest: z.array(TxFactSchema).max(5),
  new_merchants: z.array(z.string()),
  recurring: z.array(RecurringFactSchema),
  budgets: z.array(BudgetFactSchema),
  overdraft: z.strictObject({
    fuliza_drawdown: MoneySchema,
    fuliza_repaid: MoneySchema,
    fuliza_cost: MoneySchema,
    days_in_overdraft: CountSchema,
  }),
  income: z.array(IncomeFactSchema),
  trend_months: z.array(TrendMonthSchema),
  ytd: TotalsSchema.nullable(),
  anomalies: z.array(AnomalySchema),
  late_arrivals: CountSchema,
  unknown_messages: CountSchema,
  candidate_insights: z.array(CandidateInsightSchema),
  display_strings: z.array(z.string()),
});
export type FactsSheet = z.infer<typeof FactsSheetSchema>;
