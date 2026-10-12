import { describe, expect, it } from 'vitest';

import { nextMonthlyRun, nextReportAt, nextWeeklyRun } from './schedule.js';

describe('schedule in Africa/Nairobi', () => {
  it('finds the next weekly slot, including later the same day and next week', () => {
    const mon = new Date('2026-10-12T09:00:00+03:00');
    expect(nextWeeklyRun('SUN 19:30', mon)?.toISOString()).toBe('2026-10-18T16:30:00.000Z');
    expect(nextWeeklyRun('MON 10:00', mon)?.toISOString()).toBe('2026-10-12T07:00:00.000Z');
    expect(nextWeeklyRun('MON 08:00', mon)?.toISOString()).toBe('2026-10-19T05:00:00.000Z');
    expect(nextWeeklyRun('FUNDAY 08:00', mon)).toBeNull();
  });

  it('finds the next monthly slot and clamps day 31', () => {
    const now = new Date('2026-10-12T09:00:00+03:00');
    expect(nextMonthlyRun('1 07:30', now)?.toISOString()).toBe('2026-11-01T04:30:00.000Z');
    expect(nextMonthlyRun('12 09:00', now)?.toISOString()).toBe('2026-11-12T06:00:00.000Z');
    expect(nextMonthlyRun('12 09:01', now)?.toISOString()).toBe('2026-10-12T06:01:00.000Z');
    expect(nextMonthlyRun('31 08:00', new Date('2026-11-05T00:00:00+03:00'))?.toISOString()).toBe('2026-11-30T05:00:00.000Z');
    expect(nextMonthlyRun('0 08:00', now)).toBeNull();
  });

  it('returns the earlier of the two', () => {
    const now = new Date('2026-10-30T09:00:00+03:00');
    expect(nextReportAt({ weekly_at: 'SUN 19:30', monthly_at: '1 07:30' }, now)?.toISOString()).toBe('2026-11-01T04:30:00.000Z');
  });
});
