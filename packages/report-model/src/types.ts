/**
 * Public type surface of the report model: the two contract documents and named helpers for their parts.
 * The generated files mirror `contracts/*.schema.json` exactly; this file only names things conveniently.
 */
import type { FactsSheet as GeneratedFactsSheet } from './generated/facts-sheet.js';
import type { Section } from './generated/report-document.js';

export type {
  AccountFact,
  BudgetFact,
  CandidateInsight,
  CategoryFact,
  Count,
  DayFact,
  Delta,
  Drilldown,
  FactsSheet,
  MerchantFact,
  Money,
  Pct,
  Period,
  PersonFact,
  RecurringFact,
  Totals,
  TxFact,
} from './generated/facts-sheet.js';
export type { ChartType, ReportDocument, Section } from './generated/report-document.js';

export type Locale = 'en' | 'sw';
export type ReportKind = 'weekly' | 'monthly';
export type Theme = 'light' | 'dark';

export type SectionOf<T extends Section['type']> = Extract<Section, { type: T }>;
export type HeroSection = SectionOf<'hero'>;
export type KpisSection = SectionOf<'kpis'>;
export type ChartSection = SectionOf<'chart'>;
export type InsightsSection = SectionOf<'insights'>;
export type TableSection = SectionOf<'table'>;
export type ListSection = SectionOf<'list'>;
export type CalloutSection = SectionOf<'callout'>;
export type WatchSection = SectionOf<'watch'>;
export type FooterSection = SectionOf<'footer'>;

export type TrendMonth = GeneratedFactsSheet['trend_months'][number];
export type IncomeSource = GeneratedFactsSheet['income'][number];
export type TimeOfDayBucket = GeneratedFactsSheet['time_of_day'][number];
export type Anomaly = GeneratedFactsSheet['anomalies'][number];

export const FACTS_SHEET_VERSION = '1' as const;
export const REPORT_DOCUMENT_VERSION = '1' as const;
