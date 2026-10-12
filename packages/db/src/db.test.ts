import type { Transaction } from '@hesabu/analytics';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getDatabaseUrl } from './client.js';
import type { Db } from './index.js';
import { canReachDatabase, openTestDb } from './test-db.js';

const reachable = await canReachDatabase();

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    account_ref: 'mpesa:07XXXXX123',
    provider: 'mpesa',
    external_ref: null,
    type: 'BUY_GOODS',
    direction: 'out',
    amount_cents: 45_000,
    fee_cents: 0,
    balance_after_cents: 1_000_000,
    occurred_at: '2026-10-06T12:00:00+03:00',
    received_at: '2026-10-06T12:00:05+03:00',
    counterparty: { kind: 'till', name: 'NAIVAS SUPERMARKET', till: '123456' },
    category_id: 'groceries',
    category_source: 'merchant',
    category_confidence: 0.9,
    is_transfer: false,
    transfer_pair_id: null,
    parse_confidence: 0.99,
    source: 'sms',
    raw_hash: 'a'.repeat(64),
    parser: { pack_id: 'mpesa', pack_version: '1.0.0', family_id: 'buy_goods' },
    user_edited: false,
    note: null,
    tags: [],
    updated_at: '2026-10-06T12:00:05+03:00',
    ...overrides,
  };
}

describe('getDatabaseUrl', () => {
  it('fails closed when missing or malformed', () => {
    expect(() => getDatabaseUrl({})).toThrow(/DATABASE_URL is not set/);
    expect(() => getDatabaseUrl({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
    expect(getDatabaseUrl({ DATABASE_URL: 'postgres://a:b@c/d' })).toBe('postgres://a:b@c/d');
  });
});

describe.skipIf(!reachable)('db (Postgres)', () => {
  let db: Db;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await openTestDb();
    alice = (await db.system.registerDevice({ device_id: 'dev-alice', platform: 'android', app_version: '1.0' })).user_id;
    bob = (await db.system.registerDevice({ device_id: 'dev-bob', platform: 'android', app_version: '1.0' })).user_id;
  });
  afterAll(async () => {
    await db?.close();
  });

  it('registers a device once and re-finds its user', async () => {
    const again = await db.system.registerDevice({ device_id: 'dev-alice', platform: 'android', app_version: '1.1' });
    expect(again.user_id).toBe(alice);
    expect(again.created_user).toBe(false);
    expect(alice).not.toBe(bob);
  });

  it('stores and reads preferences per user', async () => {
    const prefs = await db.forUser(alice).updatePreferences({ locale: 'sw', email: 'alice@example.test', channels: ['email'] });
    expect(prefs.locale).toBe('sw');
    expect(prefs.email).toBe('alice@example.test');
    expect(prefs.channels).toEqual(['email']);
    expect((await db.forUser(bob).getPreferences()).locale).toBe('en');
    const cleared = await db.forUser(alice).updatePreferences({ email: null });
    expect(cleared.email).toBeNull();
  });

  it('upserts transactions idempotently by id and updated_at', async () => {
    const a = db.forUser(alice);
    const first = await a.upsertTransactions([tx('11111111-1111-4111-8111-111111111111')]);
    expect(first).toEqual({ accepted: 1, rejected: [] });
    // Same row again: accepted (idempotent), nothing changes.
    const same = await a.upsertTransactions([tx('11111111-1111-4111-8111-111111111111')]);
    expect(same.accepted).toBe(1);
    // Older edit is ignored, newer edit wins.
    await a.upsertTransactions([tx('11111111-1111-4111-8111-111111111111', { note: 'old', updated_at: '2026-10-05T00:00:00+03:00' })]);
    await a.upsertTransactions([tx('11111111-1111-4111-8111-111111111111', { note: 'new', updated_at: '2026-10-07T00:00:00+03:00' })]);
    const rows = await a.listTransactions({ from: '2026-10-06T00:00:00+03:00', to: '2026-10-07T00:00:00+03:00' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBe('new');
    expect(rows[0]?.amount_cents).toBe(45_000);
    expect(rows[0]?.counterparty.name).toBe('NAIVAS SUPERMARKET');
  });

  it('rejects a second id for the same provider reference', async () => {
    const a = db.forUser(alice);
    await a.upsertTransactions([tx('22222222-2222-4222-8222-222222222222', { external_ref: 'RJK3H5T2QW', raw_hash: 'b'.repeat(64) })]);
    const dup = await a.upsertTransactions([tx('33333333-3333-4333-8333-333333333333', { external_ref: 'RJK3H5T2QW', raw_hash: 'c'.repeat(64) })]);
    expect(dup.accepted).toBe(0);
    expect(dup.rejected).toEqual([{ id: '33333333-3333-4333-8333-333333333333', reason: 'duplicate_reference' }]);
    // The same code under a different family (a Fuliza drawdown funding that payment) is a distinct row.
    const fuliza = await a.upsertTransactions([
      tx('44444444-4444-4444-8444-444444444444', { external_ref: 'RJK3H5T2QW', raw_hash: 'd'.repeat(64), type: 'FULIZA_DRAWDOWN', direction: 'in', parser: { pack_id: 'mpesa', pack_version: '1.0.0', family_id: 'fuliza_drawdown' } }),
    ]);
    expect(fuliza).toEqual({ accepted: 1, rejected: [] });
  });

  it('never returns another user’s rows (tenancy)', async () => {
    const b = db.forUser(bob);
    expect(await b.listTransactions({ from: '2020-01-01T00:00:00Z', to: '2030-01-01T00:00:00Z' })).toEqual([]);
    expect(await b.countTransactions()).toBe(0);
    expect(await b.listAccounts()).toEqual([]);
    expect(await b.listReports()).toEqual([]);
    // Ids are per user: Bob storing the same id (identical message on his phone) never touches Alice's row.
    const same = await b.upsertTransactions([tx('11111111-1111-4111-8111-111111111111', { note: 'bobs', updated_at: '2030-01-01T00:00:00Z' })]);
    expect(same).toEqual({ accepted: 1, rejected: [] });
    const alices = await db.forUser(alice).listTransactions({ from: '2020-01-01T00:00:00Z', to: '2030-01-01T00:00:00Z' });
    expect(alices.find((t) => t.id === '11111111-1111-4111-8111-111111111111')?.note).toBe('new');
    const bobs = await b.listTransactions({ from: '2020-01-01T00:00:00Z', to: '2030-01-01T00:00:00Z' });
    expect(bobs.map((t) => t.note)).toEqual(['bobs']);
    // Reports are invisible across users even by id.
    const r = await db.forUser(alice).ensureReport('weekly', '2026-10-05T00:00:00+03:00', '2026-10-12T00:00:00+03:00');
    expect(await b.getReport(r.id)).toBeNull();
    expect(await b.listDeliveries(r.id)).toEqual([]);
    await expect(b.updateReport(r.id, { status: 'done' })).rejects.toThrow(/not found/);
  });

  it('deletes only this user’s transactions', async () => {
    const b = db.forUser(bob);
    await b.upsertTransactions([tx('55555555-5555-4555-8555-555555555555', { raw_hash: 'e'.repeat(64) })]);
    expect(await b.deleteAllTransactions()).toBeGreaterThanOrEqual(1);
    expect(await b.countTransactions()).toBe(0);
    expect(await db.forUser(alice).countTransactions()).toBeGreaterThan(0);
  });

  it('refuses a tenant handle without a user id', () => {
    expect(() => db.forUser('')).toThrow(/user id/);
  });

  it('keeps one report per (kind, period_start) and one delivery per (report, channel)', async () => {
    const a = db.forUser(alice);
    const r1 = await a.ensureReport('weekly', '2026-09-28T00:00:00+03:00', '2026-10-05T00:00:00+03:00');
    const r2 = await a.ensureReport('weekly', '2026-09-28T00:00:00+03:00', '2026-10-05T00:00:00+03:00');
    expect(r1.id).toBe(r2.id);
    const d1 = await a.ensureDelivery(r1.id, 'email');
    const d2 = await a.ensureDelivery(r1.id, 'email');
    expect(d1.id).toBe(d2.id);
    const bumped = await a.updateDelivery(d1.id, { status: 'sent', provider_message_id: 'msg-1', bump_attempts: true });
    expect(bumped.attempts).toBe(1);
    expect(bumped.status).toBe('sent');
    const hit = await db.system.updateDeliveryByProviderMessageId('msg-1', 'delivered');
    expect(hit).toEqual({ user_id: alice, report_id: r1.id });
    expect((await a.listDeliveries(r1.id))[0]?.status).toBe('delivered');
    expect(await db.system.updateDeliveryByProviderMessageId('nope', 'delivered')).toBeNull();
    const updated = await a.updateReport(r1.id, { status: 'done', writer: 'fallback', facts_json: { version: '1' }, generated_at: '2026-10-05T07:00:00+03:00' });
    expect(updated.status).toBe('done');
    expect(updated.facts_json).toEqual({ version: '1' });
    expect(updated.generated_at).toBe('2026-10-05T04:00:00.000Z');
  });

  it('resolves report links until they expire', async () => {
    const a = db.forUser(alice);
    const r = await a.ensureReport('monthly', '2026-09-01T00:00:00+03:00', '2026-10-01T00:00:00+03:00');
    await a.createReportLink(r.id, 'hash-live', '2030-01-01T00:00:00Z');
    await a.createReportLink(r.id, 'hash-dead', '2020-01-01T00:00:00Z');
    expect((await db.system.resolveReportLink('hash-live'))?.report_id).toBe(r.id);
    expect(await db.system.resolveReportLink('hash-dead')).toBeNull();
    expect(await db.system.resolveReportLink('unknown')).toBeNull();
  });

  it('tracks consents, budgets, categories, audit and AI spend', async () => {
    const a = db.forUser(alice);
    expect(await a.hasConsent('ai_fallback')).toBe(false);
    await a.grantConsent('ai_fallback');
    expect(await a.hasConsent('ai_fallback')).toBe(true);
    await a.revokeConsent('ai_fallback');
    expect(await a.hasConsent('ai_fallback')).toBe(false);
    // Delivery consents carry the proven address and die when the address changes.
    await expect(a.grantConsent('whatsapp_delivery')).rejects.toThrow(/proven address/);
    await a.updatePreferences({ whatsapp_e164: '+254700000001' });
    await a.grantConsent('whatsapp_delivery', '1', '+254700000001');
    expect(await a.hasConsentFor('whatsapp_delivery', '+254700000001')).toBe(true);
    expect(await a.hasConsentFor('whatsapp_delivery', '+254700000002')).toBe(false);
    await a.updatePreferences({ locale: 'en' }); // unrelated change keeps it
    expect(await a.hasConsentFor('whatsapp_delivery', '+254700000001')).toBe(true);
    await a.updatePreferences({ whatsapp_e164: '+254700000002' });
    expect(await a.hasConsent('whatsapp_delivery')).toBe(false);
    await expect(db.forUser(bob).updatePreferences({ whatsapp_e164: '+254700000002' })).rejects.toThrow(/another account/);
    expect((await a.getUser())?.join_code).toMatch(/^[A-F0-9]{8}$/);
    expect(await db.system.findUserByJoinCode((await a.getUser())!.join_code.toLowerCase())).toBe(alice);
    await a.upsertBudget({ category_id: 'groceries', period: 'weekly', limit_cents: 500_000 });
    await a.upsertBudget({ category_id: 'groceries', period: 'weekly', limit_cents: 600_000 });
    expect(await a.listBudgets()).toMatchObject([{ category_id: 'groceries', limit_cents: 600_000 }]);
    await a.upsertCategories([{ category_id: 'groceries', parent_id: null, name_en: 'Groceries', name_sw: 'Vyakula', kind: 'spend' }]);
    expect((await a.listCategories())[0]?.name_sw).toBe('Vyakula');
    await a.audit('worker', 'report.generated', { kind: 'weekly' });
    await a.recordAiUsage({ step: 'write', model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 200, cost_usd: 0.008 });
    expect(await db.system.aiSpendUsdSince(new Date(Date.now() - 60_000))).toBeCloseTo(0.008, 6);
    expect((await db.system.listUsersForScheduling()).map((u) => u.user_id).sort()).toEqual([alice, bob].sort());
  });
});
