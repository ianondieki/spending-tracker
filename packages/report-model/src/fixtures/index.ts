/**
 * Fixtures for every consumer of the report model: a complete weekly and monthly FactsSheet, each with a
 * matching ReportDocument in English and Kiswahili. `fixtures/*.json` in the package root are the same objects
 * written out for non-TypeScript consumers (the Android app, Lane B's tests); `pnpm fixtures` regenerates them
 * and a test fails when they drift.
 */
import type { FactsSheet, ReportDocument } from '../types.js';
import { monthlyDocEn, monthlyDocSw } from './monthly-doc.js';
import { monthlyFacts } from './monthly-facts.js';
import { weeklyDocEn, weeklyDocSw } from './weekly-doc.js';
import { weeklyFacts } from './weekly-facts.js';

export const FIXTURE_NAMES = ['weekly-en', 'weekly-sw', 'monthly-en', 'monthly-sw'] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

export interface ReportFixture {
  readonly name: FixtureName;
  readonly facts: FactsSheet;
  readonly document: ReportDocument;
}

export const fixtures: Readonly<Record<FixtureName, ReportFixture>> = {
  'weekly-en': { name: 'weekly-en', facts: weeklyFacts, document: weeklyDocEn },
  'weekly-sw': { name: 'weekly-sw', facts: { ...weeklyFacts, user: { ...weeklyFacts.user, locale: 'sw' } }, document: weeklyDocSw },
  'monthly-en': { name: 'monthly-en', facts: monthlyFacts, document: monthlyDocEn },
  'monthly-sw': { name: 'monthly-sw', facts: { ...monthlyFacts, user: { ...monthlyFacts.user, locale: 'sw' } }, document: monthlyDocSw },
};

export function isFixtureName(value: unknown): value is FixtureName {
  return typeof value === 'string' && (FIXTURE_NAMES as readonly string[]).includes(value);
}

export function getFixture(name: string): ReportFixture | null {
  return isFixtureName(name) ? fixtures[name] : null;
}

export { weeklyFacts, monthlyFacts, weeklyDocEn, weeklyDocSw, monthlyDocEn, monthlyDocSw };
export { buildFactsSheet, collectDisplayStrings, type FixtureInput } from './build.js';
export { WEEKLY_INPUT } from './weekly-facts.js';
export { MONTHLY_INPUT } from './monthly-facts.js';
