/**
 * Cross-lane contract check: when @hesabu/analytics exports `sampleFactsSheet`, the numbers-only report built
 * from the engine's own sheet must validate and pass the fact-checker against the engine's display_strings.
 * Skipped (not failed) when the export is absent, so this package never depends on another lane's fixtures.
 */
import * as analytics from '@hesabu/analytics';
import { describe, expect, it } from 'vitest';

import { ReportDocumentSchema } from './contracts/report-document.js';
import { writeFallback } from './fallback-writer.js';

const sample = (analytics as Record<string, unknown>)['sampleFactsSheet'];
const hasSample = typeof sample === 'function';

describe.runIf(hasSample)('engine sample sheet (contract)', () => {
  for (const kind of ['weekly', 'monthly'] as const) {
    for (const locale of ['en', 'sw'] as const) {
      it(`${kind} ${locale}: the fallback validates and passes the fact-check`, () => {
        const facts = analytics.FactsSheetSchema.parse((sample as (k: string) => unknown)(kind));
        const doc = writeFallback(facts, { report_id: 'contract', kind, locale, now: new Date('2026-10-12T07:00:00Z') });
        expect(ReportDocumentSchema.safeParse(doc).success).toBe(true);
        expect(doc.meta.fact_check.violations).toEqual([]);
      });
    }
  }
});
