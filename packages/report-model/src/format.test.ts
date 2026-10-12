import { describe, expect, it } from 'vitest';

import { compactKsh, delta, formatKsh, numbersIn, pct, ratioPct } from './format.js';

describe('formatKsh', () => {
  it('formats whole shillings with thousands separators', () => {
    expect(formatKsh(1_245_000)).toBe('KSh 12,450');
    expect(formatKsh(0)).toBe('KSh 0');
    expect(formatKsh(99_999_900)).toBe('KSh 999,999');
  });
  it('writes negatives after the symbol and signs deltas', () => {
    expect(formatKsh(-120_000)).toBe('KSh -1,200');
    expect(formatKsh(120_000, { signed: true })).toBe('KSh +1,200');
    expect(formatKsh(0, { signed: true })).toBe('KSh 0');
  });
  it('rounds half away from zero to whole shillings', () => {
    expect(formatKsh(150)).toBe('KSh 2');
    expect(formatKsh(149)).toBe('KSh 1');
    expect(formatKsh(-150)).toBe('KSh -2');
  });
});

describe('percentages and deltas', () => {
  it('rounds to whole percent', () => {
    expect(pct(29.9)).toEqual({ value: 30, display: '30%' });
    expect(ratioPct(0, 0)).toEqual({ value: 0, display: '0%' });
    expect(ratioPct(312, 20450).display).toBe('2%');
  });
  it('derives direction and percent from the previous value', () => {
    expect(delta(2_045_000, 1_890_000)).toEqual({ cents: 155_000, display: 'KSh +1,550', pct: { value: 8, display: '8%' }, direction: 'up' });
    expect(delta(100, 100).direction).toBe('flat');
    expect(delta(0, 0).direction).toBe('na');
    expect(delta(500, 0).pct.value).toBe(0);
  });
});

describe('compactKsh and numbersIn', () => {
  it('compacts axis ticks', () => {
    expect(compactKsh(0)).toBe('0');
    expect(compactKsh(500)).toBe('500');
    expect(compactKsh(1000)).toBe('1K');
    expect(compactKsh(12500)).toBe('12.5K');
    expect(compactKsh(1_200_000)).toBe('1.2M');
  });
  it('finds number tokens in copy', () => {
    expect(numbersIn('You spent KSh 20,450, 8% more. Fees 2%.')).toEqual(['20,450', '8%', '2%']);
  });
});
