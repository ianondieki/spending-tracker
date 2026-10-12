import { describe, expect, it } from 'vitest';

import { centsToShillings, delta, formatCount, formatMoney, formatPct, formatSignedMoney, ratioPct, sumMinor } from './money.js';

describe('money formatting', () => {
  it('rounds half up away from zero to whole shillings', () => {
    expect(centsToShillings(1250)).toBe(13);
    expect(centsToShillings(1249)).toBe(12);
    expect(centsToShillings(-1250)).toBe(-13);
    expect(centsToShillings(0)).toBe(0);
  });

  it('formats money and signed deltas', () => {
    expect(formatMoney(1_245_000)).toBe('KSh 12,450');
    expect(formatMoney(-340_000)).toBe('KSh -3,400');
    expect(formatMoney(99)).toBe('KSh 1');
    expect(formatSignedMoney(120_000)).toBe('KSh +1,200');
    expect(formatSignedMoney(-340_000)).toBe('KSh -3,400');
    expect(formatSignedMoney(0)).toBe('KSh 0');
    expect(formatMoney(123_456_789_00)).toBe('KSh 123,456,789');
  });

  it('formats percent and counts', () => {
    expect(formatPct(12)).toBe('12%');
    expect(formatPct(-8)).toBe('-8%');
    expect(formatCount(1204)).toBe('1,204');
    expect(formatCount(7)).toBe('7');
  });

  it('computes whole-percent ratios', () => {
    expect(ratioPct(1, 3)).toBe(33);
    expect(ratioPct(2, 3)).toBe(67);
    expect(ratioPct(1, 0)).toBe(0);
    expect(ratioPct(-5, 100)).toBe(-5);
    expect(ratioPct(5, 1000)).toBe(1); // 0.5 rounds up
  });

  it('computes deltas with direction', () => {
    expect(delta(1_200_00, 1_000_00)).toEqual({ cents: 20_000, display: 'KSh +200', pct: { value: 20, display: '20%' }, direction: 'up' });
    expect(delta(800_00, 1_000_00).direction).toBe('down');
    expect(delta(1_000_00, 1_000_00).direction).toBe('flat');
    expect(delta(1_000_00, 0).direction).toBe('na');
    expect(delta(0, 0).direction).toBe('flat');
  });

  it('sumMinor fails closed on non-integers', () => {
    expect(sumMinor([10_000, 25_050, -5_000])).toBe(30_050);
    expect(() => sumMinor([1.5])).toThrow(TypeError);
    expect(() => sumMinor([Number.NaN])).toThrow(TypeError);
  });
});
