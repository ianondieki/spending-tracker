import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type ChartSection, FIXTURE_NAMES, fixtures } from '@hesabu/report-model';

import { PHONE_WIDTH } from './common.js';
import { resolveChart } from './resolve.js';
import { themeVars } from './theme.js';

const THEMES = ['light', 'dark'] as const;

function chartSections(name: (typeof FIXTURE_NAMES)[number]): ChartSection[] {
  return fixtures[name].document.sections.filter((s): s is ChartSection => s.type === 'chart');
}

describe('every chart section in every fixture renders', () => {
  for (const name of FIXTURE_NAMES) {
    for (const section of chartSections(name)) {
      for (const theme of THEMES) {
        it(`${name} ${section.chart_id} (${section.chart_type}) ${theme}`, () => {
          const { facts, document } = fixtures[name];
          const html = renderToStaticMarkup(resolveChart(section, facts, { locale: document.locale, theme }));
          expect(html).toContain(`data-chart="${section.chart_type}"`);
          expect(html).toContain(`data-chart-id="${section.chart_id}"`);
          expect(html).toContain('role="img"');
          expect(html).toContain(`<title>${escapeHtml(section.alt_text)}</title>`);
          // Theme variables are inline so the markup is self-contained.
          expect(html).toContain(`--h-ink:${themeVars(theme)['--h-ink']}`);
          // No literal colour reaches a mark: everything goes through a variable.
          const marks = html.match(/(?:fill|stroke)="#[0-9a-f]{6}"/gi) ?? [];
          expect(marks).toEqual([]);
          // Data table twin exists.
          expect(html).toContain('<table class="h-ledger');
          expect(html).toMatchSnapshot();
        });
      }
    }
  }
});

describe('charts are deterministic and responsive', () => {
  it('renders the same markup twice', () => {
    const { facts, document } = fixtures['weekly-en'];
    const section = chartSections('weekly-en')[0]!;
    const a = renderToStaticMarkup(resolveChart(section, facts, { locale: document.locale, theme: 'light' }));
    const b = renderToStaticMarkup(resolveChart(section, facts, { locale: document.locale, theme: 'light' }));
    expect(a).toBe(b);
  });

  it('lays out at phone width without NaN or negative sizes', () => {
    for (const name of FIXTURE_NAMES) {
      const { facts, document } = fixtures[name];
      for (const section of chartSections(name)) {
        const html = renderToStaticMarkup(resolveChart(section, facts, { locale: document.locale, width: PHONE_WIDTH }));
        expect(html, section.chart_id).not.toMatch(/NaN|undefined|="-\d/);
        expect(html).toContain(`width="${PHONE_WIDTH}"`);
      }
    }
  });

  it('uses the computed alt text when the section text is not preferred', () => {
    const { facts, document } = fixtures['weekly-en'];
    const section = chartSections('weekly-en').find((s) => s.chart_type === 'fee_meter')!;
    const html = renderToStaticMarkup(resolveChart(section, facts, { locale: document.locale, preferSectionAltText: false }));
    expect(html).toContain('Fees KSh 312, 2% of spending KSh 20,450.');
  });
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
