import { describe, expect, it } from 'vitest';

import { lastMonthlyRun, lastWeeklyRun, nextMonthlyRun, nextWeeklyRun } from '@hesabu/analytics';
import { dueReports } from './scheduler.js';

const user = { user_id: 'u1', locale: 'en' as const, week_start: 'monday' as const, weekly_at: 'SUN 19:30', monthly_at: '1 07:30', channels: ['email' as const] };

describe('schedule arithmetic', () => {
  it('finds next and last weekly slots in Nairobi time', () => {
    const mon = new Date('2026-10-12T09:00:00+03:00');
    expect(nextWeeklyRun('SUN 19:30', mon)?.toISOString()).toBe('2026-10-18T16:30:00.000Z');
    expect(lastWeeklyRun('SUN 19:30', mon)?.toISOString()).toBe('2026-10-11T16:30:00.000Z');
    expect(lastWeeklyRun('MON 09:00', mon)?.toISOString()).toBe('2026-10-12T06:00:00.000Z');
    expect(lastWeeklyRun('MON 09:01', mon)?.toISOString()).toBe('2026-10-05T06:01:00.000Z');
    expect(lastWeeklyRun('XXX 09:01', mon)).toBeNull();
  });

  it('finds next and last monthly slots, clamping day 31', () => {
    const now = new Date('2026-10-12T09:00:00+03:00');
    expect(nextMonthlyRun('1 07:30', now)?.toISOString()).toBe('2026-11-01T04:30:00.000Z');
    expect(lastMonthlyRun('1 07:30', now)?.toISOString()).toBe('2026-10-01T04:30:00.000Z');
    expect(lastMonthlyRun('31 08:00', new Date('2026-10-05T00:00:00+03:00'))?.toISOString()).toBe('2026-09-30T05:00:00.000Z');
  });
});

describe('dueReports', () => {
  it('is empty when no slot fell inside the look-back window', () => {
    expect(dueReports([user], new Date('2026-10-14T12:00:00+03:00'))).toEqual([]);
  });

  it('a Sunday evening slot reports the week ending that night', () => {
    const due = dueReports([user], new Date('2026-10-11T19:35:00+03:00'));
    expect(due).toEqual([
      { user_id: 'u1', kind: 'weekly', period_start: '2026-10-05T00:00:00+03:00', period_end: '2026-10-12T00:00:00+03:00', slot: '2026-10-11T16:30:00.000Z' },
    ]);
  });

  it('a Monday morning slot reports the week that just ended', () => {
    const due = dueReports([{ ...user, weekly_at: 'MON 08:00' }], new Date('2026-10-12T08:05:00+03:00'));
    expect(due[0]).toMatchObject({ kind: 'weekly', period_start: '2026-10-05T00:00:00+03:00', period_end: '2026-10-12T00:00:00+03:00' });
  });

  it('queues last month on the first of the month, and both kinds when they coincide', () => {
    expect(dueReports([user], new Date('2026-11-01T08:00:00+03:00')).map((d) => [d.kind, d.period_start])).toEqual([
      ['monthly', '2026-10-01T00:00:00+03:00'],
    ]);
    expect(dueReports([user], new Date('2026-11-01T20:00:00+03:00')).map((d) => [d.kind, d.period_start])).toEqual([
      ['weekly', '2026-10-26T00:00:00+03:00'],
      ['monthly', '2026-10-01T00:00:00+03:00'],
    ]);
  });

  it('respects a Sunday week start', () => {
    const due = dueReports([{ ...user, week_start: 'sunday', weekly_at: 'SAT 20:00' }], new Date('2026-10-10T20:05:00+03:00'));
    expect(due[0]?.period_start).toBe('2026-10-04T00:00:00+03:00');
    expect(due[0]?.period_end).toBe('2026-10-11T00:00:00+03:00');
  });
});
