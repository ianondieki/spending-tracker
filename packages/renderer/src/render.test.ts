import { describe, expect, it } from 'vitest';

import { FIXTURE_NAMES, fixtures } from '@hesabu/report-model';

import { chartSections, renderEmail, renderHeroHtml, renderWebHtml, type RenderOptions } from './render.js';

const opts = (locale: 'en' | 'sw', theme: 'light' | 'dark' = 'light'): RenderOptions => ({ theme, locale, baseUrl: 'https://hesabu.test', reportUrl: 'https://hesabu.test/r/token-fixture' });

/** The embedded fonts are ~130 KB of base64; snapshots keep the rest. */
function withoutFonts(html: string): string {
  return html.replace(/@font-face \{[^}]*\}/g, '@font-face {…}');
}

describe.each(FIXTURE_NAMES)('HTML outputs for %s', (name) => {
  const { document: doc, facts } = fixtures[name];

  it('web HTML is standalone, themed and deterministic', () => {
    const a = renderWebHtml(doc, facts, opts(doc.locale, 'dark'));
    const b = renderWebHtml(doc, facts, opts(doc.locale, 'dark'));
    expect(a).toBe(b);
    expect(a).toContain('<html lang="' + doc.locale + '" data-theme="dark">');
    expect(a).toContain('@font-face');
    expect(a).toContain('data:font/woff2;base64,');
    expect(a).toContain('class="h-tally"');
    expect(a).toContain('href="https://hesabu.test/r/token-fixture"');
    expect(a).not.toMatch(/<link [^>]*href="http/);
    expect(a).not.toMatch(/<script/);
    if (name === 'weekly-en' || name === 'monthly-sw') expect(withoutFonts(a)).toMatchSnapshot();
  });

  it('hero HTML carries the tally, three insight lines and the donut', () => {
    const html = renderHeroHtml(doc, facts, 'light');
    expect(html).toContain('class="hero"');
    expect(html).toContain('data-chart="donut"');
    expect((html.match(/<li>/g) ?? []).length).toBe(3);
    expect(withoutFonts(html)).toMatchSnapshot();
  });

  it('email HTML is table-based with cid images and a text twin', () => {
    const ids = chartSections(doc).map((s) => s.chart_id);
    const { html, text } = renderEmail(doc, opts(doc.locale), ids);
    expect(html).toContain('src="cid:hero"');
    for (const id of ids) expect(html).toContain(`src="cid:${id}"`);
    expect(html).not.toContain('var(--');
    expect(html).not.toMatch(/<link|<script|<style/);
    expect(html).toContain(doc.email.preheader);
    expect(text).toContain(doc.title.toUpperCase());
    expect(text).toContain('https://hesabu.test/r/token-fixture');
    const hero = doc.sections.find((s) => s.type === 'hero');
    if (hero?.type === 'hero') expect(text).toContain(hero.total_out);
    expect(html).toMatchSnapshot();
    expect(text).toMatchSnapshot();
  });
});
