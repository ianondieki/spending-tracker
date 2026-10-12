import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatKsh, numbersIn } from '../format.js';
import type { ReportDocument, Section } from '../types.js';
import { validateFactsSheet, validateReportDocument } from '../validate.js';
import { FIXTURE_NAMES, fixtures } from './index.js';

/** Every piece of copy in a document that a reader sees, as (path, text) pairs. */
function copyIn(doc: ReportDocument): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ['title', doc.title],
    ['period_label', doc.period_label],
    ['whatsapp.caption', doc.whatsapp.caption],
    ['email.subject', doc.email.subject],
    ['email.preheader', doc.email.preheader],
  ];
  doc.sections.forEach((s: Section, i) => {
    const at = (k: string) => `sections[${i}].${k}`;
    switch (s.type) {
      case 'hero':
        out.push([at('total_out'), s.total_out], [at('delta'), s.delta], [at('verdict'), s.verdict]);
        break;
      case 'kpis':
        s.items.forEach((k, j) => out.push([at(`items[${j}]`), `${k.label} ${k.value} ${k.delta ?? ''}`]));
        break;
      case 'chart':
        out.push([at('title'), s.title], [at('alt_text'), s.alt_text]);
        if (s.takeaway) out.push([at('takeaway'), s.takeaway]);
        break;
      case 'insights':
        s.items.forEach((k, j) => out.push([at(`items[${j}]`), `${k.headline} ${k.body}`]));
        break;
      case 'table':
        out.push([at('title'), s.title]);
        s.rows.forEach((r, j) => out.push([at(`rows[${j}]`), r.join(' ')]));
        if (s.total_row) out.push([at('total_row'), s.total_row.join(' ')]);
        break;
      case 'list':
      case 'watch':
        out.push([at('title'), s.title]);
        s.items.forEach((k, j) => out.push([at(`items[${j}]`), k]));
        break;
      case 'callout':
        out.push([at('body'), s.body]);
        break;
      case 'footer':
        out.push([at('computed_note'), s.computed_note], [at('unknown_count'), s.unknown_count]);
        break;
    }
  });
  return out;
}

describe.each(FIXTURE_NAMES)('fixture %s', (name) => {
  const { facts, document } = fixtures[name];

  it('facts validate against the contract schema', () => {
    const r = validateFactsSheet(facts);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it('document validates against the contract schema', () => {
    const r = validateReportDocument(document);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it('document and facts agree on kind, locale and period', () => {
    expect(document.kind).toBe(facts.period.kind === 'week' ? 'weekly' : 'monthly');
    expect(document.locale).toBe(facts.user.locale);
    expect(document.period_label).toBe(facts.user.locale === 'en' ? facts.period.label_en : facts.period.label_sw);
  });

  it('every number in the copy appears in display_strings', () => {
    const allowed = facts.display_strings;
    const offenders: string[] = [];
    for (const [path, text] of copyIn(document)) {
      for (const token of numbersIn(text)) {
        // Small whole numbers are dates ("15 October"), ordinals and counts in words-with-figures; anything with a
        // thousands separator, a percent sign or four or more digits must come from the sheet verbatim.
        const strict = token.includes(',') || token.includes('%') || token.replace(/\D/g, '').length >= 4;
        const ok = allowed.some((s) => s.includes(token)) || (!strict && Number(token) <= 31);
        if (!ok) offenders.push(`${path}: ${token} in "${text}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tally rows are formatted from their cents and add up to the hero total', () => {
    const hero = document.sections.find((s) => s.type === 'hero');
    if (!hero || hero.type !== 'hero') throw new Error('no hero');
    for (const row of hero.tally) expect(row.value).toBe(formatKsh(row.cents));
    expect(hero.tally.reduce((a, r) => a + r.cents, 0)).toBe(facts.totals.out.cents);
    expect(hero.total_out).toBe(facts.totals.out.display);
  });

  it('chart sections point at data that exists and use stable ids', () => {
    const ids = new Set<string>();
    for (const s of document.sections) {
      if (s.type !== 'chart') continue;
      expect(ids.has(s.chart_id)).toBe(false);
      ids.add(s.chart_id);
      const parts = s.data_ref.split('/').slice(1);
      let node: unknown = facts;
      for (const p of parts) node = (node as Record<string, unknown>)[p];
      expect(node, s.data_ref).toBeDefined();
    }
    expect(document.whatsapp.hero_chart_ids.every((id) => ids.has(id))).toBe(true);
  });

  it('matches the committed JSON fixture', () => {
    const file = join(import.meta.dirname, '..', '..', 'fixtures', `${name}.json`);
    expect(existsSync(file), `${file} missing: run pnpm fixtures`).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ facts, document });
  });
});

describe('facts internals', () => {
  it.each(FIXTURE_NAMES)('%s: category spend sums to the total and shares to roughly 100', (name) => {
    const { facts } = fixtures[name];
    expect(facts.categories.reduce((a, c) => a + c.out.cents, 0)).toBe(facts.totals.out.cents);
    const shares = facts.categories.reduce((a, c) => a + c.share.value, 0);
    expect(Math.abs(shares - 100)).toBeLessThanOrEqual(facts.categories.length);
    expect(facts.daily.reduce((a, d) => a + d.out.cents, 0)).toBe(facts.totals.out.cents);
    expect(facts.totals.net.cents).toBe(facts.totals.in.cents - facts.totals.out.cents - facts.totals.fees.cents);
  });
});
