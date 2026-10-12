import { type FactsSheet, money } from '@hesabu/analytics';
import { describe, expect, it } from 'vitest';

import { ReportDocumentSchema, type Section } from './contracts/report-document.js';
import { factCheck } from './fact-check.js';
import { buildCaption, LIMITS, writeFallback } from './fallback-writer.js';
import { sampleFacts, withDisplayStrings } from './test-fixtures.js';

const now = new Date('2026-10-11T16:30:00Z');
const kinds = ['weekly', 'monthly'] as const;
const locales = ['en', 'sw'] as const;

function charts(sections: Section[]): string[] {
  return sections.flatMap((s) => (s.type === 'chart' ? [s.chart_id] : []));
}

describe('writeFallback', () => {
  for (const kind of kinds) {
    for (const locale of locales) {
      it(`builds a valid ${kind} ${locale} document that passes the fact-check`, () => {
        const facts = sampleFacts(kind);
        const doc = writeFallback(facts, {
          report_id: 'rpt_1',
          kind,
          locale,
          baseUrl: 'https://hesabu.app',
          now,
        });
        expect(ReportDocumentSchema.safeParse(doc).success).toBe(true);
        expect(doc.sections.length).toBeGreaterThanOrEqual(3);
        expect(doc.whatsapp.caption.length).toBeLessThanOrEqual(1000);
        expect(doc.email.subject.length).toBeLessThanOrEqual(80);
        expect(doc.email.preheader.length).toBeLessThanOrEqual(120);
        expect(doc.meta.fact_check).toEqual({ passed: true, violations: [], attempts: 0 });
        expect(factCheck(doc, facts).passed).toBe(true);
        expect(doc.meta).toMatchObject({
          writer: 'fallback',
          model: null,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          facts_version: '1',
          generated_at: now.toISOString(),
        });
        expect(doc.period_label).toBe(
          locale === 'sw' ? facts.period.label_sw : facts.period.label_en,
        );
      });
    }
  }

  it('orders the sections and charts as the report spec says', () => {
    const weekly = writeFallback(sampleFacts('weekly'), {
      report_id: 'w',
      kind: 'weekly',
      locale: 'en',
      now,
    });
    expect(weekly.sections.map((s) => s.type)).toEqual([
      'hero',
      'kpis',
      'chart',
      'chart',
      'chart',
      'chart',
      'chart',
      'chart',
      'insights',
      'table',
      'callout',
      'watch',
      'footer',
    ]);
    expect(charts(weekly.sections)).toEqual([
      'donut',
      'daily_bars',
      'stacked_in_out',
      'top_bars_merchants',
      'budget_bullets',
      'fee_meter',
    ]);
    const monthly = writeFallback(sampleFacts('monthly'), {
      report_id: 'm',
      kind: 'monthly',
      locale: 'en',
      now,
    });
    expect(charts(monthly.sections)).toEqual([
      'donut',
      'daily_bars',
      'stacked_in_out',
      'top_bars_merchants',
      'trend_lines',
      'waterfall',
      'calendar_heatmap',
      'budget_bullets',
      'fee_meter',
    ]);
    for (const s of monthly.sections)
      if (s.type === 'chart') expect(s.alt_text.length).toBeGreaterThan(20);
  });

  it('builds the hero from the sheet: days for weekly, top seven categories for monthly', () => {
    const weeklyFacts = sampleFacts('weekly');
    const hero = writeFallback(weeklyFacts, { report_id: 'w', kind: 'weekly', locale: 'sw', now })
      .sections[0];
    expect(hero?.type).toBe('hero');
    if (hero?.type !== 'hero') return;
    expect(hero.total_out).toBe('KSh 12,450');
    expect(hero.delta).toBe('KSh +1,200');
    expect(hero.delta_direction).toBe('up');
    expect(hero.verdict).toBe('Umetumia 11% zaidi ya wiki iliyopita (KSh +1,200).');
    expect(hero.tally.map((r) => r.label)).toEqual([
      'Jumatatu',
      'Jumanne',
      'Jumatano',
      'Alhamisi',
      'Ijumaa',
      'Jumamosi',
      'Jumapili',
    ]);
    expect(hero.tally.reduce((a, r) => a + r.cents, 0)).toBe(weeklyFacts.totals.out.cents);

    const monthlyFacts = sampleFacts('monthly');
    const mhero = writeFallback(monthlyFacts, {
      report_id: 'm',
      kind: 'monthly',
      locale: 'en',
      now,
    }).sections[0];
    if (mhero?.type !== 'hero') throw new Error('no hero');
    expect(mhero.tally).toHaveLength(7);
    expect(mhero.tally[0]?.label).toBe(monthlyFacts.categories[0]?.name_en);
  });

  it('renders insights from the engine order, capped at 7 weekly and 12 monthly, with drill-downs', () => {
    const weeklyFacts = sampleFacts('weekly');
    const weekly = writeFallback(weeklyFacts, {
      report_id: 'w',
      kind: 'weekly',
      locale: 'en',
      now,
    });
    const wi = weekly.sections.find((s) => s.type === 'insights');
    if (wi?.type !== 'insights') throw new Error('no insights');
    expect(weeklyFacts.candidate_insights.length).toBeGreaterThan(7);
    expect(wi.items.map((i) => i.insight_id)).toEqual(
      weeklyFacts.candidate_insights.slice(0, 7).map((c) => c.id),
    );
    expect(wi.items[0]?.drilldown).toEqual(weeklyFacts.candidate_insights[0]?.drilldown);

    const monthlyFacts = sampleFacts('monthly');
    const mi = writeFallback(monthlyFacts, {
      report_id: 'm',
      kind: 'monthly',
      locale: 'en',
      now,
    }).sections.find((s) => s.type === 'insights');
    if (mi?.type !== 'insights') throw new Error('no insights');
    expect(monthlyFacts.candidate_insights.length).toBeGreaterThan(12);
    expect(mi.items).toHaveLength(12);
  });

  it('follows a given insight selection, and skips an insight that cannot be rendered safely', () => {
    const facts = sampleFacts('weekly');
    const broken: FactsSheet = {
      ...facts,
      candidate_insights: facts.candidate_insights.map((c) =>
        c.id === 'ins_top' ? { ...c, params: { category_en: 'Food' } } : c,
      ),
    };
    const doc = writeFallback(broken, {
      report_id: 'w',
      kind: 'weekly',
      locale: 'en',
      now,
      insightIds: ['ins_fees', 'ins_top', 'nope', 'ins_new'],
    });
    const ins = doc.sections.find((s) => s.type === 'insights');
    if (ins?.type !== 'insights') throw new Error('no insights');
    expect(ins.items.map((i) => i.insight_id)).toEqual(['ins_fees', 'ins_new']);
  });

  it('builds the category table with numeric columns and a total row', () => {
    const facts = sampleFacts('weekly');
    const table = writeFallback(facts, {
      report_id: 'w',
      kind: 'weekly',
      locale: 'en',
      now,
    }).sections.find((s) => s.type === 'table');
    if (table?.type !== 'table') throw new Error('no table');
    expect(table.columns).toEqual(['Category', 'Spent', 'Share', 'Change']);
    expect(table.numeric_columns).toEqual([1, 2, 3]);
    expect(table.rows[0]).toEqual(['Food & groceries', 'KSh 4,200', '34%', 'KSh +400']);
    expect(table.total_row).toEqual(['Total', 'KSh 12,450', '', 'KSh +1,200']);
  });

  it('adds the fee callout only when fees were paid', () => {
    const facts = sampleFacts('weekly');
    const withFees = writeFallback(facts, { report_id: 'w', kind: 'weekly', locale: 'en', now });
    expect(withFees.sections.find((s) => s.type === 'callout')).toMatchObject({
      tone: 'fee',
      body: expect.stringContaining('KSh 238'),
    });

    const noFees = withDisplayStrings({ ...facts, totals: { ...facts.totals, fees: money(0) } }, [
      'KSh 0',
    ]);
    const doc = writeFallback(noFees, { report_id: 'w', kind: 'weekly', locale: 'en', now });
    expect(doc.sections.some((s) => s.type === 'callout')).toBe(false);
    expect(charts(doc.sections)).not.toContain('fee_meter');
    expect(doc.meta.fact_check.passed).toBe(true);
  });

  it('adds a watch section of one to three items only when there is something to watch', () => {
    const facts = sampleFacts('weekly');
    const watch = writeFallback(facts, {
      report_id: 'w',
      kind: 'weekly',
      locale: 'en',
      now,
    }).sections.find((s) => s.type === 'watch');
    if (watch?.type !== 'watch') throw new Error('no watch');
    expect(watch.items).toEqual([
      'Netflix: KSh 1,100 due around 2026-10-15',
      'Food & groceries: KSh 9,000 of KSh 15,000 used, heading for KSh 25,000',
      'Uber: about KSh 450 every week',
    ]);
    const quiet = writeFallback(
      { ...facts, recurring: [], budgets: [] },
      { report_id: 'w', kind: 'weekly', locale: 'en', now },
    );
    expect(quiet.sections.some((s) => s.type === 'watch')).toBe(false);
  });

  it('only watches what is still ahead, and says "heading for" only when the projection is higher', () => {
    const facts = sampleFacts('weekly');
    const pastDue: FactsSheet = {
      ...facts,
      recurring: facts.recurring.map((r) =>
        r.merchant === 'Netflix' ? { ...r, next_expected: '2026-10-05' } : r,
      ),
      budgets: facts.budgets.map((b) =>
        b.category_id === 'food' ? { ...b, projected: b.spent } : b,
      ),
    };
    const watch = writeFallback(pastDue, {
      report_id: 'w',
      kind: 'weekly',
      locale: 'sw',
      now,
    }).sections.find((s) => s.type === 'watch');
    if (watch?.type !== 'watch') throw new Error('no watch');
    expect(watch.items).toEqual([
      'Chakula na mahitaji: umetumia KSh 9,000 kati ya KSh 15,000',
      'Uber: takriban KSh 450 kila wiki',
    ]);
  });

  it('writes a WhatsApp caption with the bold total, three headlines and the report link', () => {
    const doc = writeFallback(sampleFacts('weekly'), {
      report_id: 'rpt 7',
      kind: 'weekly',
      locale: 'en',
      baseUrl: 'https://hesabu.app/',
      now,
    });
    const lines = doc.whatsapp.caption.split('\n');
    expect(lines[0]).toBe('*Your week in money*');
    expect(doc.whatsapp.caption).toContain('Spent: *KSh 12,450*');
    expect(lines.filter((l) => l.startsWith('• '))).toHaveLength(3);
    expect(lines.at(-1)).toBe('Full report: https://hesabu.app/r/rpt%207');
    expect(doc.whatsapp.hero_chart_ids).toEqual(['donut']);
    expect(doc.email.subject).toBe('Your week in money: 5 to 11 October 2026');
    expect(doc.email.preheader).toBe('You spent KSh 12,450 (KSh +1,200). Fees: KSh 238.');
  });

  it('keeps a caption within 1000 characters even with long headlines', () => {
    const caption = buildCaption({
      title: 'Your week in money',
      periodLabel: '5 to 11 October 2026',
      spentLine: 'Spent: *KSh 12,450*',
      verdict: 'You spent the same as last week.',
      headlines: ['x'.repeat(400), 'y'.repeat(400), 'z'.repeat(400)],
      link: 'Full report: https://hesabu.app/r/1',
    });
    expect(caption.length).toBeLessThanOrEqual(LIMITS.caption);
    expect(caption).toContain('Full report');
  });

  it('still produces at least three valid sections from an almost empty sheet', () => {
    const facts = sampleFacts('weekly');
    const empty: FactsSheet = {
      ...facts,
      categories: [],
      merchants: [],
      candidate_insights: [],
      recurring: [],
      budgets: [],
      spendiest_day: null,
    };
    const doc = writeFallback(empty, { report_id: 'e', kind: 'weekly', locale: 'en', now });
    expect(ReportDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.sections.length).toBeGreaterThanOrEqual(3);
    expect(doc.meta.fact_check.passed).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const facts = sampleFacts('monthly');
    const a = writeFallback(facts, { report_id: 'm', kind: 'monthly', locale: 'sw', now });
    const b = writeFallback(facts, { report_id: 'm', kind: 'monthly', locale: 'sw', now });
    expect(a).toEqual(b);
  });
});
