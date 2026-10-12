import { describe, expect, it } from 'vitest';

import { getDatabaseUrl } from './index.js';

describe('getDatabaseUrl', () => {
  it('returns a postgres URL', () => {
    expect(getDatabaseUrl({ DATABASE_URL: 'postgres://hesabu:hesabu@localhost:5432/hesabu' })).toBe(
      'postgres://hesabu:hesabu@localhost:5432/hesabu',
    );
  });

  it('fails closed when missing or malformed', () => {
    expect(() => getDatabaseUrl({})).toThrow(/DATABASE_URL is not set/);
    expect(() => getDatabaseUrl({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });
});
