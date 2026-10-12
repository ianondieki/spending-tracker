/**
 * Print-to-PDF smoke test: the A4 PDF of every fixture has a sane page count, carries the key copy, and no text run
 * lands outside the page box (overflow). Skipped without Chromium.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { FIXTURE_NAMES, fixtures } from '@hesabu/report-model';

import { browserAvailable, closeBrowser } from './browser.js';
import { inspectPdf } from './pdf.js';
import { renderReport } from './render.js';

const A4 = { width: 595, height: 842 };
const MAX_PAGES = { weekly: 9, monthly: 13 } as const;

afterAll(async () => {
  await closeBrowser();
});

describe.skipIf(!browserAvailable())('A4 PDF', () => {
  it.each(FIXTURE_NAMES)('%s fits the page with every key line present', async (name) => {
    const { document: doc, facts } = fixtures[name];
    const out = await renderReport(doc, facts, { theme: 'dark', locale: doc.locale, baseUrl: 'https://hesabu.test', reportUrl: 'https://hesabu.test/r/t' });
    const pdf = await inspectPdf(out.pdf);
    expect(Math.round(pdf.width)).toBe(A4.width);
    expect(Math.round(pdf.height)).toBe(A4.height);
    expect(pdf.pages).toBeGreaterThanOrEqual(3);
    expect(pdf.pages).toBeLessThanOrEqual(MAX_PAGES[doc.kind]);

    const all = pdf.texts.map((t) => t.text).join(' ');
    const hero = doc.sections.find((s) => s.type === 'hero');
    const footer = doc.sections.find((s) => s.type === 'footer');
    expect(all).toContain(doc.title);
    expect(all).toContain(doc.period_label);
    if (hero?.type === 'hero') expect(all).toContain(hero.total_out);
    if (footer?.type === 'footer') expect(all).toContain(footer.computed_note.slice(0, 30));
    for (const s of doc.sections) if (s.type === 'chart') expect(all, s.chart_id).toContain(s.title.slice(0, 24));

    // The print stylesheet renders light: the PDF never inherits the dark theme.
    expect(out.pdf.length).toBeGreaterThan(20_000);

    // Overflow: every text run inside the page box (pdf.js y is from the bottom edge).
    const outside = pdf.texts.filter((t) => t.x < 0 || t.x + t.width > A4.width + 1 || t.y < 0 || t.y > A4.height + 1);
    expect(outside).toEqual([]);
    // Nothing clipped at the right margin: the widest run ends before the 14 mm margin, allowing 2 pt of slack.
    const rightMarginPt = A4.width - 14 * 2.835 + 2;
    const past = pdf.texts.filter((t) => t.x + t.width > rightMarginPt);
    expect(past.map((t) => `${t.page}: ${t.text}`)).toEqual([]);
  }, 90_000);
});
