// GENERATED FILE. Do not edit by hand: run `pnpm --filter @hesabu/report-model gen`.
// Source: contracts/facts-sheet.schema.json (frozen contract, orchestrator-owned).

/**
 * Everything a report may say, computed by packages/analytics from the ledger. Every money and percentage value carries a pre-formatted display string; narrative text may only contain numbers that appear verbatim as a display string somewhere in this sheet (the fact-checker enforces it).
 */
export interface FactsSheet {
  version: '1';
  generated_at: string;
  user: {
    locale: 'en' | 'sw';
    week_start: string;
    display_name?: string | null;
  };
  period: Period;
  previous_period: Period;
  totals: Totals;
  previous_totals: Totals;
  deltas: {
    out: Delta;
    in: Delta;
    fees: Delta;
    net: Delta;
  };
  /**
   * sorted by out desc; includes every category with spend
   */
  categories: CategoryFact[];
  /**
   * @maxItems 15
   */
  merchants: MerchantFact[];
  /**
   * @maxItems 10
   */
  people: PersonFact[];
  accounts: AccountFact[];
  daily: DayFact[];
  average_daily_out: Money;
  spendiest_day: DayFact | null;
  weekday_weekend: {
    weekday_out: Money;
    weekend_out: Money;
    weekend_share: Pct;
  };
  time_of_day: {
    bucket: 'morning' | 'afternoon' | 'evening' | 'night';
    out: Money;
    count: Count;
  }[];
  /**
   * @maxItems 5
   */
  largest: TxFact[];
  new_merchants: string[];
  recurring: RecurringFact[];
  budgets: BudgetFact[];
  overdraft: {
    fuliza_drawdown: Money;
    fuliza_repaid: Money;
    fuliza_cost: Money;
    days_in_overdraft: Count;
  };
  income: {
    source: string;
    kind: 'salary' | 'business' | 'person' | 'refund' | 'other';
    in: Money;
    count: Count;
  }[];
  /**
   * last 6 months, monthly reports only (empty for weekly)
   */
  trend_months: {
    /**
     * YYYY-MM
     */
    month: string;
    label_en: string;
    label_sw: string;
    in: Money;
    out: Money;
    fees: Money;
    net: Money;
    is_current: boolean;
  }[];
  ytd: Totals | null;
  anomalies: {
    kind: 'duplicate' | 'unusual_amount' | 'reversal' | 'fee_spike' | 'balance_break';
    transaction_ids: string[];
    params: {
      [k: string]: (string | number | boolean | null) | undefined;
    };
  }[];
  late_arrivals: Count;
  unknown_messages: Count;
  candidate_insights: CandidateInsight[];
  /**
   * Flat list of every display string in this sheet, built by the engine; the fact-checker's allow-list
   */
  display_strings: string[];
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "Period".
 */
export interface Period {
  kind: 'week' | 'month';
  start: string;
  end: string;
  /**
   * e.g. 6 to 12 October 2026
   */
  label_en: string;
  label_sw: string;
  days: number;
  /**
   * for in-progress periods
   */
  days_elapsed: number;
  timezone: 'Africa/Nairobi';
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "Totals".
 */
export interface Totals {
  in: Money;
  out: Money;
  fees: Money;
  net: Money;
  transfers: Money;
  cash_withdrawn: Money;
  savings_out: Money;
  loan_repayments: Money;
  transaction_count: Count;
  fee_ratio: Pct;
  savings_rate: Pct;
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "Money".
 */
export interface Money {
  cents: number;
  /**
   * e.g. KSh 12,450 (whole shillings, rounded half up)
   */
  display: string;
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "Count".
 */
export interface Count {
  value: number;
  display: string;
}
/**
 * fees / out
 */
export interface Pct {
  /**
   * whole percent, may be negative
   */
  value: number;
  /**
   * e.g. 12% or -8%
   */
  display: string;
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "Delta".
 */
export interface Delta {
  cents: number;
  /**
   * signed, e.g. KSh +1,200 or KSh -3,400
   */
  display: string;
  pct: Pct;
  direction: 'up' | 'down' | 'flat' | 'na';
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "CategoryFact".
 */
export interface CategoryFact {
  category_id: string;
  name_en: string;
  name_sw: string;
  out: Money;
  share: Pct;
  delta: Delta;
  count: Count;
  top_merchant?: string | null;
  drilldown: Drilldown;
}
/**
 * How the app or web viewer shows the transactions behind a number
 *
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "Drilldown".
 */
export interface Drilldown {
  kind: 'transactions';
  filter: {
    from?: string;
    to?: string;
    category_id?: string | null;
    merchant?: string | null;
    counterparty_ref?: string | null;
    account_ref?: string | null;
    direction?: string | null;
    types?: string[];
    transaction_ids?: string[];
  };
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "MerchantFact".
 */
export interface MerchantFact {
  name: string;
  category_id?: string | null;
  out: Money;
  count: Count;
  is_new: boolean;
  drilldown: Drilldown;
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "PersonFact".
 */
export interface PersonFact {
  /**
   * as parsed, may be masked
   */
  name: string;
  ref_masked?: string | null;
  sent: Money;
  received: Money;
  count: Count;
  drilldown: Drilldown;
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "AccountFact".
 */
export interface AccountFact {
  account_ref: string;
  label: string;
  provider: string;
  balance: Money | null;
  balance_at: string | null;
  in: Money;
  out: Money;
  fees: Money;
  balance_series: {
    at: string;
    cents: number;
  }[];
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "DayFact".
 */
export interface DayFact {
  date: string;
  weekday_en: string;
  weekday_sw: string;
  out: Money;
  in: Money;
  count: Count;
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "TxFact".
 */
export interface TxFact {
  id: string;
  occurred_at: string;
  amount: Money;
  direction: string;
  counterparty?: string | null;
  category_id?: string | null;
  type: string;
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "RecurringFact".
 */
export interface RecurringFact {
  merchant: string;
  category_id?: string | null;
  cadence: 'weekly' | 'monthly' | 'irregular';
  typical_amount: Money;
  last_paid: string;
  next_expected: string | null;
  confidence: number;
  is_subscription: boolean;
  drilldown: Drilldown;
}
/**
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "BudgetFact".
 */
export interface BudgetFact {
  category_id: string;
  limit: Money;
  spent: Money;
  projected: Money;
  used: Pct;
  status: 'ok' | 'watch' | 'over';
}
/**
 * A fact pattern the engine found. The insight-select step ranks these; the writer may only use these and the sheet. The numbers-only fallback renders them from i18n templates keyed by kind.
 *
 * This interface was referenced by `FactsSheet`'s JSON-Schema
 * via the `definition` "CandidateInsight".
 */
export interface CandidateInsight {
  id: string;
  kind:
    | 'spend_vs_last'
    | 'top_category'
    | 'biggest_transaction'
    | 'new_merchant'
    | 'duplicate_payment'
    | 'unusual_amount'
    | 'fees_total'
    | 'fee_ratio_change'
    | 'fuliza_usage'
    | 'cash_withdrawn'
    | 'savings_rate'
    | 'income_received'
    | 'sent_to_people'
    | 'spendiest_day'
    | 'weekend_share'
    | 'late_night_spend'
    | 'budget_at_risk'
    | 'budget_over'
    | 'subscription_due'
    | 'recurring_found'
    | 'category_rising'
    | 'category_falling'
    | 'personal_record'
    | 'late_arrivals'
    | 'unknown_messages'
    | 'month_projection'
    | 'balance_low'
    | 'no_fees_week';
  severity: 'info' | 'notable' | 'important';
  /**
   * Only display strings and names; numbers never raw here
   */
  params: {
    [k: string]: (string | number | boolean | null) | undefined;
  };
  drilldown: Drilldown;
}
