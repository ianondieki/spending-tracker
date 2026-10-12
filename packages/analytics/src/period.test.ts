import { describe, expect, it } from 'vitest';

import { inPeriod, localHour, periodContaining, previousPeriod, resolvePeriod, startOfWeek, toLocalDate } from './period.js';

describe('Nairobi periods', () => {
  it('converts instants to Nairobi dates', () => {
    // 2026-10-11T22:30Z is already 12 October in Nairobi.
    expect(toLocalDate('2026-10-11T22:30:00Z')).toEqual({ year: 2026, month: 10, day: 12 });
    expect(localHour('2026-10-11T22:30:00Z')).toBe(1);
  });

  it('starts weeks on Monday by default and on Sunday when asked', () => {
    const wed = { year: 2026, month: 10, day: 7 };
    expect(startOfWeek(wed)).toEqual({ year: 2026, month: 10, day: 5 });
    expect(startOfWeek(wed, 'sunday')).toEqual({ year: 2026, month: 10, day: 4 });
  });

  it('builds a week period with labels in both languages', () => {
    const p = periodContaining('week', { year: 2026, month: 10, day: 7 }, { now: '2026-10-20T00:00:00Z' });
    expect(p.start).toBe('2026-10-05T00:00:00+03:00');
    expect(p.end).toBe('2026-10-12T00:00:00+03:00');
    expect(p.label_en).toBe('5 to 11 October 2026');
    expect(p.label_sw).toBe('5 hadi 11 Oktoba 2026');
    expect(p.days).toBe(7);
    expect(p.days_elapsed).toBe(7);
  });

  it('labels weeks that cross a month boundary', () => {
    const p = periodContaining('week', { year: 2026, month: 9, day: 30 });
    expect(p.label_en).toBe('28 September to 4 October 2026');
    expect(p.label_sw).toBe('28 Septemba hadi 4 Oktoba 2026');
  });

  it('builds month periods and the previous period', () => {
    const p = periodContaining('month', { year: 2026, month: 10, day: 12 }, { now: '2026-10-12T10:00:00+03:00' });
    expect(p.start).toBe('2026-10-01T00:00:00+03:00');
    expect(p.end).toBe('2026-11-01T00:00:00+03:00');
    expect(p.label_en).toBe('October 2026');
    expect(p.days).toBe(31);
    expect(p.days_elapsed).toBe(12);
    const prev = previousPeriod(p);
    expect(prev.start).toBe('2026-09-01T00:00:00+03:00');
    expect(prev.days).toBe(30);
    expect(prev.days_elapsed).toBe(30);
  });

  it('resolves API period specs', () => {
    const now = '2026-10-12T09:00:00+03:00'; // Monday
    expect(resolvePeriod('weekly', 'last_week', { now }).start).toBe('2026-10-05T00:00:00+03:00');
    expect(resolvePeriod('weekly', 'current', { now }).start).toBe('2026-10-12T00:00:00+03:00');
    expect(resolvePeriod('monthly', 'last_month', { now }).label_en).toBe('September 2026');
    expect(resolvePeriod('monthly', '2026-02-10', { now }).days).toBe(28);
  });

  it('tests membership with an exclusive end', () => {
    const p = periodContaining('week', { year: 2026, month: 10, day: 7 });
    expect(inPeriod(p, '2026-10-05T00:00:00+03:00')).toBe(true);
    expect(inPeriod(p, '2026-10-11T23:59:59+03:00')).toBe(true);
    expect(inPeriod(p, '2026-10-12T00:00:00+03:00')).toBe(false);
  });
});
