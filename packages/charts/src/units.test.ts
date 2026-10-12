import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { heatBin } from './charts/CalendarHeatmap.js';
import { foldSlices } from './charts/Donut.js';
import { waterfallSteps } from './charts/Waterfall.js';
import { longDate, shortDate, weekdayShort } from './dates.js';
import { hBarPath, vBarPath } from './primitives.js';
import { niceMax, niceStep, ticks } from './scale.js';
import { fit, textWidth } from './text.js';
import { themeStylesheet, themeVars } from './theme.js';
import { designTokens } from './tokens.js';

describe('tokens', () => {
  it('match contracts/design-tokens.json (run pnpm tokens when this fails)', () => {
    const contract = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'contracts', 'design-tokens.json'), 'utf8'));
    expect(designTokens).toEqual(contract);
  });
  it('expose every semantic colour and six categorical slots per theme', () => {
    for (const theme of ['light', 'dark'] as const) {
      const vars = themeVars(theme);
      for (const k of ['--h-paper', '--h-sheet', '--h-rule', '--h-ink', '--h-ink-soft', '--h-biro', '--h-in', '--h-out', '--h-fee', '--h-transfer', '--h-warn', '--h-other', '--h-average', '--h-cat-1', '--h-cat-6']) {
        expect(vars[k], k).toMatch(/^#|^"/);
      }
      expect(vars['--h-cat-7']).toBeUndefined();
    }
    expect(themeVars('light')['--h-out']).toBe(themeVars('light')['--h-ink']);
    expect(themeStylesheet()).toContain('[data-theme="dark"]');
  });
});

describe('scales', () => {
  it('picks nice steps and ticks', () => {
    expect(niceStep(6350)).toBe(2000);
    expect(niceMax(6350)).toBe(8000);
    expect(ticks(0, 8000)).toEqual([0, 2000, 4000, 6000, 8000]);
    expect(ticks(-2000, 8000)).toEqual([-2000, 0, 2000, 4000, 6000, 8000]);
  });
});

describe('marks', () => {
  it('bars have a rounded data end and a square baseline', () => {
    expect(vBarPath(10, 100, 24, 50)).toMatch(/^M10 100 V54 Q10 50 14 50 H30 Q34 50 34 54 V100 Z$/);
    expect(vBarPath(10, 100, 24, 0)).toBe('');
    expect(hBarPath(0, 10, 100, 18)).toMatch(/^M0 10 H96 Q100 10 100 14 V24 Q100 28 96 28 H0 Z$/);
  });
});

describe('text', () => {
  it('estimates width and fits with an ellipsis', () => {
    expect(textWidth('KSh 12,450', 14)).toBeGreaterThan(60);
    expect(fit('Total Energies Parklands', 60, 14)).toMatch(/…$/);
    expect(fit('KPLC', 60, 14)).toBe('KPLC');
  });
});

describe('dates', () => {
  it('formats in both locales', () => {
    expect(shortDate('2026-10-09', 'en')).toBe('9 Oct');
    expect(shortDate('2026-10-09', 'sw')).toBe('9 Okt');
    expect(longDate('2026-10-09', 'en')).toBe('Friday 9 October');
    expect(longDate('2026-10-09', 'sw')).toBe('Ijumaa 9 Oktoba');
    expect(weekdayShort('2026-10-05', 'en')).toBe('Mon');
  });
});

describe('data shaping', () => {
  it('folds the tail into Other after six slices', () => {
    const slices = Array.from({ length: 9 }, (_, i) => ({ name: `c${i}`, cents: (9 - i) * 1000, display: '', share: '' }));
    const folded = foldSlices(slices, 'Other');
    expect(folded).toHaveLength(7);
    expect(folded[6]).toMatchObject({ name: 'Other', cents: 6000, isOther: true, display: 'KSh 60' });
  });
  it('builds waterfall steps that add up to net', () => {
    const steps = waterfallSteps({ cents: 10000, display: 'a' }, [{ name: 'x', cents: 6000, display: 'b' }], { cents: 500, display: 'c' }, { cents: 3500, display: 'd' }, { income: 'In', other: 'Other', fees: 'Fees', net: 'Net' });
    const sum = steps.filter((s) => s.kind !== 'net').reduce((a, s) => a + s.cents, 0);
    expect(sum).toBe(steps[steps.length - 1]!.cents);
    expect(steps.map((s) => s.kind)).toEqual(['income', 'category', 'fees', 'net']);
  });
  it('bins heat into five steps', () => {
    expect(heatBin(0, 100)).toBe(0);
    expect(heatBin(100, 100)).toBe(4);
    expect(heatBin(50, 100)).toBe(2);
  });
});

describe('humanName', () => {
  it('title-cases shouting names and keeps acronyms and suffixes', async () => {
    const { humanName } = await import('./text.js');
    expect(humanName('QUICKMART LTD')).toBe('Quickmart Ltd');
    expect(humanName('MAKAO PROPERTIES')).toBe('Makao Properties');
    expect(humanName('KPLC PREPAID')).toBe('KPLC Prepaid');
    expect(humanName('NAIVAS LTD KILIMANI')).toBe('Naivas Ltd Kilimani');
    expect(humanName('Naivas Westlands')).toBe('Naivas Westlands');
    expect(humanName('KCB')).toBe('KCB');
    expect(humanName('M-PESA AGENT')).toBe('M-pesa Agent');
  });
});

describe('deltaSentence', () => {
  it('writes direction in words with an unsigned amount', async () => {
    const { reportStrings, unsigned } = await import('./report/strings.js');
    expect(unsigned('KSh +1,550')).toBe('KSh 1,550');
    expect(unsigned('KSh -23,375')).toBe('KSh 23,375');
    expect(reportStrings('en').deltaSentence('KSh -23,375', 'down', 'weekly')).toBe('KSh 23,375 less than last week');
    expect(reportStrings('en').deltaSentence('KSh +6,250', 'up', 'monthly')).toBe('KSh 6,250 more than last month');
    expect(reportStrings('sw').deltaSentence('KSh +1,550', 'up', 'weekly')).toBe('KSh 1,550 zaidi ya wiki iliyopita');
    expect(reportStrings('en').deltaSentence('KSh 0', 'flat', 'weekly')).toBe('The same as last week');
  });
});

describe('donut cap', () => {
  it('folds an existing Other and anything past six into one Other slice', () => {
    const slices = [
      ...Array.from({ length: 8 }, (_, i) => ({ name: `c${i}`, cents: (9 - i) * 1000, display: '', share: '' })),
      { name: 'Other', cents: 500, display: 'KSh 5', share: '1%', isOther: true },
    ];
    const folded = foldSlices(slices, 'Other');
    expect(folded).toHaveLength(7);
    expect(folded.filter((s) => s.isOther)).toHaveLength(1);
    expect(folded[6]!.cents).toBe(3000 + 2000 + 500);
  });
});
