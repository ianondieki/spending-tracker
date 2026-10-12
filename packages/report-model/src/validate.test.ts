import { describe, expect, it } from 'vitest';

import { weeklyDocEn, weeklyFacts } from './fixtures/index.js';
import { assertFactsSheet, assertReportDocument, ReportModelError, validateFactsSheet, validateReportDocument } from './validate.js';

describe('validators', () => {
  it('reject an empty object with readable errors', () => {
    const r = validateFactsSheet({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/must have required property/);
  });
  it('reject unknown properties (fail closed)', () => {
    const r = validateReportDocument({ ...weeklyDocEn, extra: 1 });
    expect(r.ok).toBe(false);
  });
  it('reject a hero verdict over 140 characters', () => {
    const doc = structuredClone(weeklyDocEn);
    const hero = doc.sections[0]!;
    if (hero.type === 'hero') hero.verdict = 'x'.repeat(141);
    expect(validateReportDocument(doc).ok).toBe(false);
  });
  it('assert helpers throw ReportModelError', () => {
    expect(() => assertFactsSheet(null)).toThrow(ReportModelError);
    expect(assertReportDocument(weeklyDocEn)).toBe(weeklyDocEn);
    expect(assertFactsSheet(weeklyFacts)).toBe(weeklyFacts);
  });
});
