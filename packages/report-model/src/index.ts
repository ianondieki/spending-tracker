/**
 * Placeholder report model. The frozen contract lives in `contracts/` (ReportDocument, FactsSheet);
 * Lane C replaces these types with the ones mirrored from the contract. Until then this file stays
 * small so nothing downstream depends on a shape that is about to change.
 */
export const REPORT_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const REPORT_PERIOD_KINDS = ['week', 'month'] as const;
export type ReportPeriodKind = (typeof REPORT_PERIOD_KINDS)[number];

export type ReportLocale = 'en' | 'sw';

/** Money is always integer minor units in KES. Numbers are computed, never generated. */
export interface Money {
  readonly currency: 'KES';
  readonly minor: number;
}

export interface ReportPeriod {
  readonly kind: ReportPeriodKind;
  /** ISO date (YYYY-MM-DD) in Africa/Nairobi, inclusive. Weeks start on Monday. */
  readonly start: string;
  /** ISO date (YYYY-MM-DD) in Africa/Nairobi, inclusive. */
  readonly end: string;
  readonly timeZone: 'Africa/Nairobi';
}

export interface ReportDocument {
  readonly schemaVersion: typeof REPORT_DOCUMENT_SCHEMA_VERSION;
  readonly period: ReportPeriod;
  readonly locale: ReportLocale;
  readonly title: string;
}

export function isReportPeriodKind(value: unknown): value is ReportPeriodKind {
  return typeof value === 'string' && (REPORT_PERIOD_KINDS as readonly string[]).includes(value);
}
