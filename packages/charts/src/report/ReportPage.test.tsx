import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FIXTURE_NAMES, fixtures } from '@hesabu/report-model';

import { ReportPage } from './ReportPage.js';

describe.each(FIXTURE_NAMES)('ReportPage %s', (name) => {
  const { document: doc, facts } = fixtures[name];

  it('renders every section in order with the tally, double rule and footer', () => {
    const html = renderToStaticMarkup(<ReportPage document={doc} facts={facts} mode="web" />);
    expect(html).toContain(`lang="${doc.locale}"`);
    expect(html).toContain('class="h-tally"');
    expect(html).toContain('h-tally__value--total');
    const hero = doc.sections.find((s) => s.type === 'hero');
    if (hero?.type === 'hero') expect(html).toContain(`>${hero.total_out}</td>`);
    const chartIds = doc.sections.filter((s) => s.type === 'chart').map((s) => (s.type === 'chart' ? s.chart_id : ''));
    for (const id of chartIds) {
      expect(html).toContain(`data-chart-id="${id}"`);
      expect(html).toContain(`data-chart-id="${id}-phone"`);
    }
    expect(html).toContain('class="h-footer"');
    expect(html).not.toMatch(/NaN|undefined/);
    // Every section type present in the document has a block.
    const types = new Set(doc.sections.map((s) => s.type));
    for (const t of types) if (t !== 'hero' && t !== 'callout' && t !== 'footer') expect(html).toContain(`h-section--${t}`);
  });

  it('static mode renders one chart per section and no table toggles', () => {
    const html = renderToStaticMarkup(<ReportPage document={doc} facts={facts} mode="static" theme="dark" />);
    expect(html).not.toContain('-phone"');
    expect(html).not.toContain('h-chart__toggle');
    expect(html).toContain('--h-ink:#E8ECF1');
  });

  it('shows the app link only when a URL is given', () => {
    const without = renderToStaticMarkup(<ReportPage document={doc} facts={facts} />);
    const withUrl = renderToStaticMarkup(<ReportPage document={doc} facts={facts} reportUrl="https://example.test/r/abc" />);
    expect(without).not.toContain('h-button');
    expect(withUrl).toContain('href="https://example.test/r/abc"');
  });
});
