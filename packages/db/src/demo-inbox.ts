/**
 * The demo ledger: `corpus/demo/demo-inbox.jsonl` (eight synthetic weeks for one persona, Lane D) parsed with
 * `@hesabu/pack-engine` exactly as the phone would, then categorised with `@hesabu/taxonomy` (merchant seeds first,
 * provider defaults second). Used by `seed:demo` and the worker's end-to-end test.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TransactionSchema, type Account, type Transaction } from '@hesabu/analytics';
import { loadAllPacks, readJsonl, runCorpus, type CorpusRunResult } from '@hesabu/pack-engine';
import { categories as taxonomyCategories, resolveCategory } from '@hesabu/taxonomy';

import type { CategoryRow } from './types.js';

export const DEMO_INBOX_PATH = fileURLToPath(new URL('../../../corpus/demo/demo-inbox.jsonl', import.meta.url));

/** Device-side variables for `account_ref_template` (the demo persona's masked SIM and bank account). */
export const DEMO_VARIABLES = { sim_msisdn_masked: '07XXXXX123', acct_mask: 'XXX456' } as const;

export interface DemoInbox {
  readonly transactions: Transaction[];
  readonly accounts: Account[];
  readonly categories: CategoryRow[];
  readonly stats: { messages: number; parsed: number; unknown: number; duplicates: number; transfer_pairs: number; balance_breaks: number };
}

export function demoInboxAvailable(file: string = DEMO_INBOX_PATH): boolean {
  return existsSync(file);
}

/** Every taxonomy category as rows for a user's `categories` table (names in both languages, kind mapped). */
export function taxonomyCategoryRows(): CategoryRow[] {
  return taxonomyCategories.map((c) => ({
    category_id: c.id,
    parent_id: c.parent_id,
    name_en: c.name_en,
    name_sw: c.name_sw,
    kind: c.kind === 'spending' ? 'spend' : c.kind === 'system' ? 'other' : c.kind,
  }));
}

/**
 * What the demo persona taught the app (the product learns these from the user's own edits; the verified merchant
 * table in @hesabu/taxonomy must not carry fictional pay bills). Keyed by counterparty name, source `user`.
 */
export const DEMO_CATEGORY_OVERRIDES: Readonly<Record<string, string>> = {
  'MAKAO PROPERTIES': 'housing_rent.rent',
  'MONTHLY LEDGER FEE': 'fees',
};

/** Refines the engine's provider-default category with the taxonomy's merchant seeds, then the persona's own rules. */
export function categorise(tx: Transaction): Transaction {
  const taught = tx.counterparty.name ? DEMO_CATEGORY_OVERRIDES[tx.counterparty.name.toUpperCase()] : undefined;
  if (taught) return { ...tx, category_id: taught, category_source: 'user', category_confidence: 1 };
  const resolved = resolveCategory({
    type: tx.type,
    direction: tx.direction,
    counterparty_kind: tx.counterparty.kind,
    provider: tx.provider,
    name: tx.counterparty.name ?? null,
    paybill: tx.counterparty.paybill ?? null,
    till: tx.counterparty.till ?? null,
  });
  if (resolved.source === 'merchant' && resolved.category_id) {
    return { ...tx, category_id: resolved.category_id, category_source: 'merchant', category_confidence: resolved.confidence };
  }
  if (!tx.category_id && resolved.category_id) {
    return { ...tx, category_id: resolved.category_id, category_source: 'provider_default', category_confidence: resolved.confidence };
  }
  return tx;
}

function accountsFrom(transactions: readonly Transaction[]): Account[] {
  const seen = new Map<string, Account>();
  for (const t of transactions) {
    const existing = seen.get(t.account_ref);
    const balance = t.balance_after_cents ?? null;
    if (!existing) {
      const isMpesa = t.provider === 'mpesa';
      seen.set(t.account_ref, {
        account_ref: t.account_ref,
        provider: t.provider,
        institution: isMpesa ? 'Safaricom' : 'Hesabu Demo Bank',
        label: isMpesa ? 'M-Pesa' : 'Demo Bank',
        mask: t.account_ref.split(':').at(-1) ?? null,
        last_balance_cents: balance,
        last_balance_at: balance === null ? null : t.occurred_at,
      });
    } else if (balance !== null && (!existing.last_balance_at || existing.last_balance_at < t.occurred_at)) {
      seen.set(t.account_ref, { ...existing, last_balance_cents: balance, last_balance_at: t.occurred_at });
    }
  }
  return [...seen.values()];
}

export function parseDemoInbox(file: string = DEMO_INBOX_PATH): DemoInbox {
  const packs = loadAllPacks();
  const lines = readJsonl(file);
  const run: CorpusRunResult = runCorpus(packs, lines, { variables: DEMO_VARIABLES });
  // The engine's output is validated against the contract first (fail closed on a bad parse), then categorised.
  const transactions = run.post.transactions
    .map((t) => categorise(TransactionSchema.parse(t)))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
  return {
    transactions,
    accounts: accountsFrom(transactions),
    categories: taxonomyCategoryRows(),
    stats: {
      messages: run.total,
      parsed: run.parsed,
      unknown: run.unknown.length,
      duplicates: run.post.duplicates,
      transfer_pairs: run.post.transfer_pairs.length,
      balance_breaks: run.post.balance.breaks.length,
    },
  };
}
