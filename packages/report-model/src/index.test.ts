import { describe, expect, it } from 'vitest';

import { isReportPeriodKind, REPORT_DOCUMENT_SCHEMA_VERSION } from './index.js';

describe('report-model placeholder', () => {
  it('pins the schema version', () => {
    expect(REPORT_DOCUMENT_SCHEMA_VERSION).toBe(1);
  });

  it('recognises only week and month periods', () => {
    expect(isReportPeriodKind('week')).toBe(true);
    expect(isReportPeriodKind('month')).toBe(true);
    expect(isReportPeriodKind('day')).toBe(false);
    expect(isReportPeriodKind(7)).toBe(false);
  });
});
