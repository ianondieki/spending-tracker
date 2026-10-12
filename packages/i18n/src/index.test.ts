import { INSIGHT_KINDS, type InsightKind } from '@hesabu/analytics';
import { describe, expect, it } from 'vitest';

import {
  CATALOGS,
  INSIGHT_PARAMS,
  insightTemplate,
  isLocale,
  LOCALES,
  lookupMessage,
  type MessageKey,
  placeholdersOf,
  renderInsight,
  renderTemplate,
  substitute,
  t,
  TemplateError,
  type TemplateParams,
  VARIANT_PARAM_VALUES,
} from './index.js';

/** Realistic engine params per kind, with long-ish names to stress the length limits. */
const SAMPLE: Record<InsightKind, Record<string, string>> = {
  spend_vs_last: { out: 'KSh 112,450', previous_out: 'KSh 101,250', delta: 'KSh +11,200', delta_pct: '11%', direction: 'up' },
  top_category: { category_id: 'food', category_en: 'Food and groceries', category_sw: 'Chakula na mahitaji ya nyumbani', out: 'KSh 42,000', share: '34%' },
  biggest_transaction: { amount: 'KSh 125,000', counterparty: 'KENYA POWER PREPAID TOKENS', date: '2026-10-06', category_id: 'utilities' },
  new_merchant: { merchant: 'Java House Junction Mall', out: 'KSh 1,200', count: '2' },
  duplicate_payment: { merchant: 'Carrefour Two Rivers Mall', amount: 'KSh 3,450', count: '2' },
  unusual_amount: { merchant: 'Naivas Supermarket Westlands', amount: 'KSh 14,800', typical: 'KSh 2,300' },
  fees_total: { fees: 'KSh 1,238', fee_ratio: '2%', count: '19' },
  fee_ratio_change: { fee_ratio: '4%', previous_fee_ratio: '2%', direction: 'up' },
  fuliza_usage: { drawdown: 'KSh 3,500', repaid: 'KSh 3,500', cost: 'KSh 115', days: '3' },
  cash_withdrawn: { amount: 'KSh 12,000', count: '4' },
  savings_rate: { rate: '7%', savings: 'KSh 13,000', income: 'KSh 185,000' },
  income_received: { income: 'KSh 185,000', count: '3', top_source: 'ACME KENYA LIMITED PAYROLL' },
  sent_to_people: { total: 'KSh 25,000', count: '6', top_person: 'JOHN KAMAU NJOROGE', top_amount: 'KSh 10,000' },
  spendiest_day: { weekday_en: 'Wednesday', weekday_sw: 'Jumatano', date: '2026-10-07', out: 'KSh 13,800' },
  weekend_share: { share: '23%', weekend_out: 'KSh 29,000', weekday_out: 'KSh 95,500' },
  late_night_spend: { out: 'KSh 4,800', count: '3' },
  budget_at_risk: { category_id: 'eating_out', category_en: 'Eating out and takeaway', category_sw: 'Kula nje na vyakula vya kubeba', spent: 'KSh 9,000', limit: 'KSh 10,000', projected: 'KSh 14,500', used: '90%' },
  budget_over: { category_id: 'eating_out', category_en: 'Eating out and takeaway', category_sw: 'Kula nje na vyakula vya kubeba', spent: 'KSh 12,300', limit: 'KSh 10,000', used: '123%' },
  subscription_due: { merchant: 'Showmax Premium Monthly', amount: 'KSh 1,100', next_expected: '2026-10-15' },
  recurring_found: { merchant: 'Zuku Home Fibre Internet', amount: 'KSh 4,100', cadence: 'monthly' },
  category_rising: { category_id: 'transport', category_en: 'Transport and fuel', category_sw: 'Usafiri na mafuta ya gari', out: 'KSh 31,000', delta: 'KSh +6,000', delta_pct: '24%' },
  category_falling: { category_id: 'transport', category_en: 'Transport and fuel', category_sw: 'Usafiri na mafuta ya gari', out: 'KSh 19,000', delta: 'KSh -6,000', delta_pct: '-24%' },
  personal_record: { metric: 'fees', value: 'KSh 238', previous_record: 'KSh 410' },
  late_arrivals: { count: '2' },
  unknown_messages: { count: '3' },
  month_projection: { projected: 'KSh 145,000', spent: 'KSh 61,000', days_elapsed: '12', days: '31' },
  balance_low: { account: 'Equity Bank savings account', balance: 'KSh 320' },
  no_fees_week: { out: 'KSh 12,450' },
};

const VARIANT_SAMPLES: Record<string, readonly string[]> = VARIANT_PARAM_VALUES;

function allCopies(locale: 'en' | 'sw', kind: InsightKind): { label: string; text: string }[] {
  const template = insightTemplate(locale, kind);
  const out = [
    { label: `${locale}.${kind}.headline`, text: template.headline },
    { label: `${locale}.${kind}.body`, text: template.body },
  ];
  for (const [name, copy] of Object.entries(template.variants ?? {})) {
    out.push({ label: `${locale}.${kind}.${name}.headline`, text: copy.headline });
    out.push({ label: `${locale}.${kind}.${name}.body`, text: copy.body });
  }
  return out;
}

describe('message catalogues', () => {
  it('has English and Kiswahili', () => {
    expect(LOCALES).toEqual(['en', 'sw']);
    expect(isLocale('sw')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  it('keeps the existing keys', () => {
    expect(t('en', 'app.name')).toBe('Hesabu');
    expect(t('en', 'report.weekly.title')).toBe('Your week in money');
    expect(t('sw', 'report.weekly.title')).toBe('Wiki yako ya pesa');
  });

  it('has every English key in Kiswahili, and no extra keys', () => {
    expect(Object.keys(CATALOGS.messages.sw).sort()).toEqual(Object.keys(CATALOGS.messages.en).sort());
  });

  it('has a verdict for every delta direction in both kinds and locales', () => {
    for (const locale of LOCALES) {
      for (const kind of ['weekly', 'monthly']) {
        for (const dir of ['up', 'down', 'flat', 'na']) {
          expect(t(locale, `hero.verdict.${kind}.${dir}` as MessageKey).length).toBeGreaterThan(10);
        }
      }
    }
  });

  it('has a title and alt text for all ten chart types', () => {
    const types = ['donut', 'daily_bars', 'stacked_in_out', 'trend_lines', 'top_bars', 'waterfall', 'calendar_heatmap', 'budget_bullets', 'balance_sparkline', 'fee_meter'];
    const keys = Object.keys(CATALOGS.messages.en);
    for (const type of types) {
      expect(keys.some((k) => k.startsWith(`chart.${type}.`) && k.includes('title'))).toBe(true);
      expect(keys.some((k) => k.startsWith(`chart.${type}.`) && k.endsWith('alt'))).toBe(true);
    }
  });

  it('writes copy without exclamation marks, digits or stray braces', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(CATALOGS.messages[locale])) {
        const text = value ?? '';
        expect(text, `${locale}:${key}`).not.toMatch(/!/);
        expect(text, `${locale}:${key}`).not.toMatch(/\d/);
        expect(text.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, ''), `${locale}:${key}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('falls back to English when a Kiswahili key is missing', () => {
    expect(lookupMessage({}, { 'a.b': 'English' }, 'a.b')).toBe('English');
    expect(lookupMessage({ 'a.b': 'Kiswahili' }, { 'a.b': 'English' }, 'a.b')).toBe('Kiswahili');
    expect(() => lookupMessage({}, {}, 'a.b')).toThrow(TemplateError);
  });
});

describe('substitution', () => {
  it('fills placeholders', () => {
    expect(renderTemplate('en', 'email.subject.weekly', { period: '5 to 11 October 2026' })).toBe(
      'Your week in money: 5 to 11 October 2026',
    );
    expect(renderTemplate('sw', 'whatsapp.spent_line', { total: 'KSh 12,450' })).toBe('Matumizi: *KSh 12,450*');
  });

  it('throws on a placeholder without a value (fail closed)', () => {
    expect(() => renderTemplate('en', 'email.subject.weekly', {})).toThrow(TemplateError);
    expect(() => substitute('Hi {name}', { name: null })).toThrow(TemplateError);
    expect(() => substitute('Hi {nmae}', { name: 'Wanjiru' })).toThrow(/nmae/);
  });

  it('throws on a placeholder outside the allowed list', () => {
    expect(() => substitute('{amount}', { amount: 'KSh 1' }, ['out'])).toThrow(/not allowed/);
  });

  it('never expands placeholders inside values', () => {
    expect(substitute('Paid {merchant}', { merchant: '{secret}' })).toBe('Paid {secret}');
  });

  it('lists placeholders', () => {
    expect(placeholdersOf('{a} and {b_2} and {a}')).toEqual(['a', 'b_2', 'a']);
  });
});

describe('insight templates', () => {
  it('covers every insight kind with the engine param list', () => {
    expect(Object.keys(INSIGHT_PARAMS).sort()).toEqual([...INSIGHT_KINDS].sort());
    expect(Object.keys(SAMPLE).sort()).toEqual([...INSIGHT_KINDS].sort());
  });

  it.each(INSIGHT_KINDS)('%s has a headline and body in both locales', (kind) => {
    for (const locale of LOCALES) {
      const own = CATALOGS.insights[locale][kind];
      expect(own, `${locale}.${kind}`).toBeDefined();
      expect(own?.headline.length).toBeGreaterThan(0);
      expect(own?.body.length).toBeGreaterThan(0);
    }
  });

  it.each(INSIGHT_KINDS)('%s uses only the params the engine emits', (kind) => {
    const allowed: readonly string[] = INSIGHT_PARAMS[kind];
    for (const locale of LOCALES) {
      for (const { label, text } of allCopies(locale, kind)) {
        for (const name of placeholdersOf(text)) {
          expect(allowed, `${label} uses {${name}}`).toContain(name);
        }
        expect(text, label).not.toMatch(/!/);
        expect(text, label).not.toMatch(/\d/);
        expect(text.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, ''), label).not.toMatch(/[{}]/);
      }
      const template = insightTemplate(locale, kind);
      if (template.variant_param !== undefined) {
        expect(allowed).toContain(template.variant_param);
        const known = VARIANT_SAMPLES[template.variant_param] ?? [];
        for (const name of Object.keys(template.variants ?? {})) expect(known).toContain(name);
      }
    }
  });

  it.each(INSIGHT_KINDS)('%s stays within the length limits with realistic params', (kind) => {
    const base = SAMPLE[kind];
    for (const locale of LOCALES) {
      const template = insightTemplate(locale, kind);
      const variants = template.variant_param === undefined ? [undefined] : [undefined, ...Object.keys(template.variants ?? {})];
      for (const variant of variants) {
        const params: TemplateParams =
          variant === undefined || template.variant_param === undefined
            ? base
            : { ...base, [template.variant_param]: variant };
        const copy = renderInsight(locale, kind, params);
        expect(copy.headline.length, `${locale}.${kind}.${variant ?? 'base'} headline: ${copy.headline}`).toBeLessThanOrEqual(90);
        expect(copy.body.length, `${locale}.${kind}.${variant ?? 'base'} body`).toBeLessThanOrEqual(280);
        expect(copy.headline).not.toMatch(/[{}]/);
        expect(copy.body).not.toMatch(/[{}]/);
      }
    }
  });

  it('substitutes and picks the variant from the direction', () => {
    const up = renderInsight('en', 'spend_vs_last', SAMPLE.spend_vs_last);
    expect(up.headline).toBe('Spending rose to KSh 112,450, from KSh 101,250');
    const down = renderInsight('sw', 'spend_vs_last', { ...SAMPLE.spend_vs_last, direction: 'down', delta: 'KSh -3,400', delta_pct: '-8%' });
    expect(down.headline).toBe('Matumizi yameshuka hadi KSh 112,450, kutoka KSh 101,250');
    expect(down.body).toContain('KSh -3,400 (-8%)');
    const top = renderInsight('sw', 'top_category', SAMPLE.top_category);
    expect(top.headline).toContain('Chakula na mahitaji ya nyumbani');
  });

  it('throws when a param the template needs is missing, and for an unknown kind', () => {
    expect(() => renderInsight('en', 'fees_total', { fees: 'KSh 238', fee_ratio: '2%' })).toThrow(TemplateError);
    expect(() => renderInsight('en', 'not_a_kind' as InsightKind, {})).toThrow(/unknown insight kind/);
  });
});
