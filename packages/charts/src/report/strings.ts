/** Chrome strings for the report page in both locales. Ordinary product copy [[COPY-REVIEW]]. */
import type { Locale } from '@hesabu/report-model';

export interface ReportStrings {
  readonly brand: string;
  readonly weekly: string;
  readonly monthly: string;
  readonly totalSpent: string;
  readonly vsLast: (kind: 'weekly' | 'monthly') => string;
  readonly accountsCovered: string;
  readonly unknownMessages: string;
  readonly openInApp: string;
  readonly fullReport: string;
  readonly generated: string;
  readonly numbersOnly: string;
  readonly skipToContent: string;
  readonly contents: string;
}

const EN: ReportStrings = {
  brand: 'Hesabu',
  weekly: 'Weekly report',
  monthly: 'Monthly report',
  totalSpent: 'Total spent',
  vsLast: (kind) => (kind === 'weekly' ? 'vs last week' : 'vs last month'),
  accountsCovered: 'Accounts covered',
  unknownMessages: 'Messages Hesabu could not read',
  openInApp: 'Open in Hesabu',
  fullReport: 'Full report',
  generated: 'Report generated',
  numbersOnly: 'Written without AI: numbers only.',
  skipToContent: 'Skip to the report',
  contents: 'In this report',
};

const SW: ReportStrings = {
  brand: 'Hesabu',
  weekly: 'Ripoti ya wiki',
  monthly: 'Ripoti ya mwezi',
  totalSpent: 'Jumla ya matumizi',
  vsLast: (kind) => (kind === 'weekly' ? 'ikilinganishwa na wiki iliyopita' : 'ikilinganishwa na mwezi uliopita'),
  accountsCovered: 'Akaunti zilizojumuishwa',
  unknownMessages: 'Jumbe ambazo Hesabu haikuweza kusoma',
  openInApp: 'Fungua kwenye Hesabu',
  fullReport: 'Ripoti kamili',
  generated: 'Ripoti imetengenezwa',
  numbersOnly: 'Imeandikwa bila AI: nambari tu.',
  skipToContent: 'Ruka hadi ripoti',
  contents: 'Katika ripoti hii',
};

export function reportStrings(locale: Locale): ReportStrings {
  return locale === 'sw' ? SW : EN;
}
