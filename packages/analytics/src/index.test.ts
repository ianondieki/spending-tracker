import { describe, expect, it } from 'vitest';

import { sumMinor } from './index.js';

describe('sumMinor', () => {
  it('sums integer minor amounts', () => {
    expect(sumMinor([10_000, 25_050, -5_000])).toBe(30_050);
    expect(sumMinor([])).toBe(0);
  });

  it('fails closed on non-integer input', () => {
    expect(() => sumMinor([1.5])).toThrow(TypeError);
    expect(() => sumMinor([Number.NaN])).toThrow(TypeError);
  });
});
