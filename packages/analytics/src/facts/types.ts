/** Inputs to the facts engine. The output is `FactsSheet` from `contracts/facts-sheet.ts`. */
import type { Period } from '../contracts/facts-sheet.js';
import type { Account, Counterparty, Transaction } from '../contracts/transaction.js';

export type CategoryKind = 'spend' | 'transfer' | 'fee' | 'savings' | 'loan' | 'income' | 'cash' | 'other';

/** Display names for a taxonomy category id. Unknown ids fall back to the id itself. */
export interface CategoryInfo {
  readonly id: string;
  readonly name_en: string;
  readonly name_sw: string;
  readonly kind?: CategoryKind;
}

export interface BudgetInput {
  readonly category_id: string;
  readonly limit_cents: number;
  readonly period: 'weekly' | 'monthly';
}

export interface FactsInput {
  readonly user: {
    readonly locale: 'en' | 'sw';
    readonly week_start: 'monday' | 'sunday';
    readonly display_name?: string | null;
  };
  readonly kind: 'weekly' | 'monthly';
  /** From `periodContaining` / `resolvePeriod`; `end` is exclusive. */
  readonly period: Period;
  /**
   * A wide window: everything from at least six months before `period.start` (and from 1 January of the
   * period's year) up to `period.end`. The engine filters; anything at or after `period.end` is dropped.
   */
  readonly transactions: readonly Transaction[];
  readonly accounts: readonly Account[];
  readonly categories: readonly CategoryInfo[];
  readonly budgets?: readonly BudgetInput[];
  readonly unknown_message_count?: number;
  /** Transactions that arrived after the previous report was generated (computed by the worker). */
  readonly late_arrival_count?: number;
  /** ISO date-time; also the clock for `previous_period.days_elapsed`, so the output never reads the real clock. */
  readonly generated_at: string;
  /**
   * Display name for a counterparty (canonical merchant name from the taxonomy when it matches a seed, say).
   * Return null to use the engine's own normaliser (`displayName`). The result is used everywhere a name is
   * shown: merchants, people, largest, recurring, anomalies and insight params.
   */
  readonly merchantName?: (counterparty: Counterparty) => string | null;
  /** The record to beat for `personal_record` insights. */
  readonly previous_report_totals?: { readonly out_cents: number; readonly in_cents: number; readonly fees_cents: number } | null;
}
