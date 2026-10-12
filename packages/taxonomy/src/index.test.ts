import { describe, expect, it } from 'vitest';

import { isSystemCategory, SYSTEM_CATEGORIES } from './index.js';

describe('taxonomy placeholder', () => {
  it('keeps transfer and fees as system categories', () => {
    expect(SYSTEM_CATEGORIES).toContain('transfer');
    expect(SYSTEM_CATEGORIES).toContain('fees');
    expect(isSystemCategory('transfer')).toBe(true);
    expect(isSystemCategory('groceries')).toBe(false);
  });
});
