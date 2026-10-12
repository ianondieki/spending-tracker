/**
 * The demo inbox is a contract with Lane A (Android demo mode) and Lane B (backend demo seed): the committed file
 * must equal what the generator produces, and the engine must parse all of it with the expected pairs and chains.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CORPUS_DIR, readJsonl, runCorpus } from '../corpus.js';
import { loadAllPacks } from '../loader.js';
import { expectationsFor } from './expectations.js';
import { DEMO_VARIABLES, DEMO_WEEKS, generateDemoInbox, toJsonl } from './generate.js';

const demoDir = path.join(CORPUS_DIR, 'demo');
const inboxPath = path.join(demoDir, 'demo-inbox.jsonl');
const expectedPath = path.join(demoDir, 'demo-inbox.expected.json');

describe('demo inbox', () => {
  const generated = generateDemoInbox();
  const committed = readFileSync(inboxPath, 'utf8');

  it('is deterministic and matches the committed file (run `pnpm demo:write` after changing the generator)', () => {
    expect(toJsonl(generated.lines)).toBe(committed);
    expect(toJsonl(generateDemoInbox().lines)).toBe(committed);
  });

  const packs = loadAllPacks();
  const lines = readJsonl(inboxPath);
  const result = runCorpus(packs, lines, { variables: DEMO_VARIABLES });

  it('parses 100 % of the messages', () => {
    expect(result.unknown.map((u) => u.line.body)).toEqual([]);
    expect(result.not_ours).toBe(0);
    expect(result.parsed + result.ignored).toBe(lines.length);
  });

  it('covers eight Monday-start weeks', () => {
    const days = lines.map((l) => l.received_at.slice(0, 10)).sort();
    expect(days[0]).toBe('2026-08-17');
    expect(days[days.length - 1]! <= '2026-10-11').toBe(true);
    expect(DEMO_WEEKS).toBe(8);
  });

  it('drops exactly the one message delivered twice', () => {
    expect(result.post.duplicates).toBe(1);
  });

  it('pairs every bank <-> M-PESA movement as a transfer and nothing else', () => {
    const pairs = result.post.transfer_pairs;
    expect(pairs).toHaveLength(3);
    const byId = new Map(result.post.transactions.map((t) => [t.id, t]));
    for (const p of pairs) {
      const out = byId.get(p.out_id)!;
      const inn = byId.get(p.in_id)!;
      expect(out.is_transfer && inn.is_transfer).toBe(true);
      expect(out.account_ref).not.toBe(inn.account_ref);
      expect(out.amount_cents).toBe(inn.amount_cents);
    }
    const unpaired = result.post.transactions.filter((t) => !t.is_transfer && ['BANK_TO_MPESA', 'MPESA_TO_BANK'].includes(t.type));
    expect(unpaired).toEqual([]);
    expect(result.post.transactions.filter((t) => t.type === 'WITHDRAW' && t.is_transfer)).toEqual([]);
  });

  it('keeps every balance chain unbroken, including through the Fuliza episode', () => {
    expect(result.post.balance.breaks).toEqual([]);
    expect(result.post.balance.checked).toBeGreaterThan(70);
    expect(result.per_family.get('fuliza_drawdown')).toBe(1);
    expect(result.per_family.get('fuliza_repay')).toBe(1);
  });

  it('includes every scene the kickoff asks for', () => {
    for (const family of ['demo_credit', 'demo_debit_to_mpesa', 'bank_to_mpesa', 'paybill', 'buy_goods', 'withdraw', 'airtime_self', 'fuliza_drawdown', 'fuliza_repay', 'send_money', 'receive_money', 'mshwari_deposit', 'mpesa_to_bank']) {
      expect(result.per_family.get(family), family).toBeGreaterThan(0);
    }
    const names = new Set(result.post.transactions.map((t) => t.counterparty.name));
    for (const n of ['KPLC PREPAID', 'NAIVAS LTD KILIMANI', 'UBER KENYA', 'NETFLIX', 'MAKAO PROPERTIES', 'ACME LOGISTICS LTD SALARY']) expect(names.has(n), n).toBe(true);
  });

  it('matches the committed expectations file that the Kotlin engine asserts against', () => {
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
    expect(expectationsFor(result)).toEqual(expected);
  });

  it('never leaks a real-looking full phone number into a transaction', () => {
    for (const t of result.post.transactions) {
      if (t.counterparty.ref_masked) expect(t.counterparty.ref_masked).toMatch(/^\d{2}X+\d{3}$|^[\dX]{1,6}$/);
    }
  });
});
