import { TransactionSchema } from '@hesabu/analytics';
import { describe, expect, it } from 'vitest';

import { demoAccounts, demoTransactions } from './demo-data.js';

describe('demo data', () => {
  it('is contract-valid, deterministic and spans two months', () => {
    const base = new Date('2026-10-12T09:00:00+03:00');
    const txs = demoTransactions(base);
    expect(txs.length).toBeGreaterThan(80);
    for (const t of txs) expect(TransactionSchema.safeParse(t).success, JSON.stringify(TransactionSchema.safeParse(t))).toBe(true);
    expect(new Set(txs.map((t) => t.id)).size).toBe(txs.length);
    expect(demoTransactions(base)).toEqual(txs);
    const first = new Date(txs[0]!.occurred_at).getTime();
    const last = new Date(txs.at(-1)!.occurred_at).getTime();
    expect((last - first) / 86_400_000).toBeGreaterThan(60);
    expect(demoAccounts(base)).toHaveLength(2);
    expect(txs.filter((t) => t.type === 'FULIZA_DRAWDOWN')).toHaveLength(1);
    expect(txs.filter((t) => t.is_transfer)).toHaveLength(6);
  });
});
