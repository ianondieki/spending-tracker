import { readFileSync } from 'node:fs';

import { TransactionSchema } from '@hesabu/analytics';
import { describe, expect, it } from 'vitest';

import { DEMO_INBOX_PATH, demoInboxAvailable, parseDemoInbox } from './demo-inbox.js';

describe.skipIf(!demoInboxAvailable())('demo inbox through the pack engine', () => {
  it('matches the corpus expectations and is contract-valid', () => {
    const expected = JSON.parse(readFileSync(DEMO_INBOX_PATH.replace(/\.jsonl$/, '.expected.json'), 'utf8')) as {
      messages: number; parsed: number; unknown: number; duplicates_dropped: number; transactions_after_dedupe: number; transfer_pairs: unknown[];
    };
    const inbox = parseDemoInbox();
    expect(inbox.stats.messages).toBe(expected.messages);
    expect(inbox.stats.parsed).toBe(expected.parsed);
    expect(inbox.stats.unknown).toBe(expected.unknown);
    expect(inbox.stats.duplicates).toBe(expected.duplicates_dropped);
    expect(inbox.transactions).toHaveLength(expected.transactions_after_dedupe);
    expect(inbox.stats.transfer_pairs).toBe(expected.transfer_pairs.length);
    expect(inbox.transactions.filter((t) => t.is_transfer)).toHaveLength(expected.transfer_pairs.length * 2);
    for (const t of inbox.transactions) expect(TransactionSchema.safeParse(t).success).toBe(true);
    expect(inbox.accounts.map((a) => a.account_ref).sort()).toEqual(['bank:demo:XXX456', 'mpesa:07XXXXX123'].sort());
    // Merchant seeds refine the engine's defaults (Naivas is a till in the taxonomy seeds).
    const naivas = inbox.transactions.find((t) => /NAIVAS/i.test(t.counterparty.name ?? ''));
    expect(naivas?.category_id).toBeTruthy();
    expect(inbox.categories.length).toBeGreaterThan(10);
    // Merchant seeds, provider defaults and the persona's own rules (rent, the bank's ledger fee) cover every spend.
    const uncategorisedOut = inbox.transactions.filter((t) => t.category_id === null && t.direction === 'out' && !t.is_transfer && t.type !== 'FULIZA_REPAY');
    expect(uncategorisedOut).toEqual([]);
    expect(inbox.transactions.find((t) => t.counterparty.name === 'MAKAO PROPERTIES')).toMatchObject({ category_id: 'housing_rent.rent', category_source: 'user' });
  });
});
