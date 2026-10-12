import { describe, expect, it } from 'vitest';

import { type Section } from './contracts/report-document.js';
import { buildAllowList, type CheckableDocument, collectCopy, factCheck, unsupportedTokens } from './fact-check.js';
import { sampleFacts } from './test-fixtures.js';

const facts = sampleFacts('weekly');
const allow = buildAllowList(facts);

/** A small document whose every number is a display string from the sheet. */
function docFromDisplayStrings(extra: { verdict?: string; headline?: string; body?: string; caption?: string } = {}): CheckableDocument {
  const sections: Section[] = [
    {
      type: 'hero',
      total_out: facts.totals.out.display,
      delta: facts.deltas.out.display,
      delta_direction: facts.deltas.out.direction,
      verdict: extra.verdict ?? `You spent ${facts.deltas.out.pct.display} more than last week (${facts.deltas.out.display}).`,
      tally: facts.daily.map((d) => ({ label: d.weekday_en, value: d.out.display, cents: d.out.cents })),
    },
    {
      type: 'insights',
      title: 'What stood out',
      items: [
        {
          insight_id: 'ins_fees',
          headline: extra.headline ?? `You paid ${facts.totals.fees.display} in fees`,
          body: extra.body ?? `That is ${facts.totals.fee_ratio.display} of your spending across 9 charges.`,
        },
      ],
    },
    {
      type: 'footer',
      accounts_covered: facts.accounts.map((a) => a.label),
      computed_note: 'Every number here is computed from your transaction messages on your phone.',
      unknown_count: `Messages not yet understood: ${facts.unknown_messages.display}`,
    },
  ];
  return {
    title: 'Your week in money',
    period_label: facts.period.label_en,
    sections,
    whatsapp: { caption: extra.caption ?? `*Your week in money*\n${facts.period.label_en}\nSpent: *${facts.totals.out.display}*` },
    email: { subject: `Your week in money: ${facts.period.label_en}`, preheader: `You spent ${facts.totals.out.display}.` },
  };
}

describe('factCheck', () => {
  it('accepts a document built only from display strings', () => {
    expect(factCheck(docFromDisplayStrings(), facts)).toEqual({ passed: true, violations: [] });
  });

  it('rejects an invented bare number', () => {
    const result = factCheck(docFromDisplayStrings({ body: 'You made 47 payments this week.' }), facts);
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(['sections[1].insights.items[0].body: 47']);
  });

  it('rejects an invented percent', () => {
    const result = factCheck(docFromDisplayStrings({ verdict: 'You spent 37% more than last week.' }), facts);
    expect(result.violations).toEqual(['sections[0].hero.verdict: 37%']);
  });

  it('rejects an invented KSh amount, and a real amount in the wrong format', () => {
    const result = factCheck(
      docFromDisplayStrings({ headline: 'You paid KSh 99,999 in fees', caption: 'Spent *KSh 12450* this week' }),
      facts,
    );
    expect(result.violations).toEqual(['sections[1].insights.items[0].headline: KSh 99,999', 'whatsapp.caption: KSh 12450']);
  });

  it('rejects a rounded or recomputed number even when close to a real one', () => {
    expect(unsupportedTokens('About KSh 12,000 went out', allow)).toEqual(['KSh 12,000']);
    expect(unsupportedTokens('Fees were 1.9% of spending', allow)).toEqual(['1.9%']);
    expect(unsupportedTokens('Spent 12,450 shillings', allow)).toEqual(['12,450']);
  });

  it('allows dates, period labels, times, years and links', () => {
    const ok = [
      'It went out on 2026-10-09.',
      'Paid at 2026-10-06T09:12:00+03:00.',
      'For 5 to 11 October 2026 and 28 September to 4 October 2026.',
      'Kwa 5 hadi 11 Oktoba 2026.',
      'Due on 15 October, or Oktoba 15, or Oct 15th.',
      'At 14:30 on Friday.',
      'Since 2025.',
      'Full report: https://hesabu.app/r/rpt_2026w41?x=12',
    ];
    for (const text of ok) expect(unsupportedTokens(text, allow), text).toEqual([]);
  });

  it('allows digits inside names from the sheet but not elsewhere', () => {
    expect(unsupportedTokens('Accounts: M-Pesa and Equity 4521.', allow)).toEqual([]);
    expect(unsupportedTokens('Card 4521 was used.', allow)).toEqual(['4521']);
  });

  it('does not treat an impossible day or a lowercase "may" as a date', () => {
    expect(unsupportedTokens('On 35 October you paid.', allow)).toEqual(['35']);
    expect(unsupportedTokens('Of these, 47 may be repeats.', allow)).toEqual(['47']);
  });

  it('allows a display count but not the same digits glued to more', () => {
    expect(unsupportedTokens('Charges counted: 9.', allow)).toEqual([]);
    expect(unsupportedTokens('Paid KSh 2,5000 today.', allow)).toEqual(['KSh 2,5000']);
  });

  it('checks every copy string in the document', () => {
    const wheres = collectCopy(docFromDisplayStrings()).map((c) => c.where);
    expect(wheres).toContain('title');
    expect(wheres).toContain('period_label');
    expect(wheres).toContain('sections[0].hero.verdict');
    expect(wheres).toContain('sections[0].hero.tally[6].value');
    expect(wheres).toContain('sections[2].footer.unknown_count');
    expect(wheres).toContain('whatsapp.caption');
    expect(wheres).toContain('email.preheader');
  });
});
