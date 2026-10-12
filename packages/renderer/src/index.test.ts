import { REPORT_DOCUMENT_SCHEMA_VERSION, type ReportDocument } from '@hesabu/report-model';
import { describe, expect, it } from 'vitest';

import { renderReport } from './index.js';

const doc: ReportDocument = {
  schemaVersion: REPORT_DOCUMENT_SCHEMA_VERSION,
  period: { kind: 'week', start: '2026-10-05', end: '2026-10-11', timeZone: 'Africa/Nairobi' },
  locale: 'en',
  title: 'Hesabu <weekly> report',
};

describe('renderReport (placeholder)', () => {
  it('returns escaped HTML and no binary outputs yet', async () => {
    const out = await renderReport(doc);
    expect(out.html).toContain('<h1>Hesabu &lt;weekly&gt; report</h1>');
    expect(out.html).toContain('2026-10-05');
    expect(out.heroPng).toBeNull();
    expect(out.pdf).toBeNull();
    expect(out.chartPngs).toEqual([]);
  });
});
