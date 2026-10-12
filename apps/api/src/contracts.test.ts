/**
 * The Zod mirrors must agree with the frozen JSON schemas in contracts/. ajv validates the same
 * fixtures the Zod schemas accept and reject, and the enums and required keys are compared directly.
 */
import { readFile } from 'node:fs/promises';

import {
  COUNTERPARTY_KINDS, FactsSheetSchema, INSIGHT_KINDS, PROVIDERS, SyncRequestSchema, TransactionSchema, TX_TYPES,
} from '@hesabu/analytics';
import { CHART_TYPES, ReportDocumentSchema } from '@hesabu/agents';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../contracts/', import.meta.url);
const load = async (name: string) => JSON.parse(await readFile(new URL(name, root), 'utf8')) as Record<string, unknown>;

const transactionSchema = await load('transaction.schema.json');
const factsSchema = await load('facts-sheet.schema.json');
const reportSchema = await load('report-document.schema.json');

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
ajv.addSchema(transactionSchema);
ajv.addSchema(factsSchema);
ajv.addSchema(reportSchema);
const validateTx = ajv.getSchema('https://hesabu.app/contracts/transaction.schema.json#/$defs/Transaction')!;
const validateSync = ajv.getSchema('https://hesabu.app/contracts/transaction.schema.json#/$defs/SyncRequest')!;

const tx = {
  id: '11111111-1111-4111-8111-111111111111',
  account_ref: 'mpesa:07XXXXX123',
  provider: 'mpesa',
  external_ref: 'RJK3H5T2QW',
  type: 'SEND_MONEY',
  direction: 'out',
  amount_cents: 150_000,
  fee_cents: 2_300,
  balance_after_cents: 845_000,
  occurred_at: '2026-10-06T12:00:00+03:00',
  received_at: '2026-10-06T12:00:05+03:00',
  counterparty: { kind: 'person', name: 'JANE W', ref_masked: '07XXXXX456' },
  category_id: null,
  category_source: 'none',
  category_confidence: 0,
  is_transfer: false,
  transfer_pair_id: null,
  parse_confidence: 0.98,
  source: 'sms',
  raw_hash: 'f'.repeat(64),
  parser: { pack_id: 'mpesa', pack_version: '1.0.0', family_id: 'send_money' },
  user_edited: false,
  note: null,
  tags: ['family'],
  updated_at: '2026-10-06T12:00:05+03:00',
};

const sync = {
  device_id: 'dev-1', app_version: '1.0.0', parser_version: '1.0.0',
  accounts: [{ account_ref: 'mpesa:07XXXXX123', provider: 'mpesa', institution: 'Safaricom', label: 'M-Pesa', mask: '07XXXXX123', last_balance_cents: 845_000, last_balance_at: '2026-10-06T12:00:00+03:00' }],
  transactions: [tx], unknown_message_count: 0, sent_at: '2026-10-06T12:01:00+03:00',
};

describe('Zod mirrors agree with the JSON schemas', () => {
  it('accept the same valid Transaction and SyncRequest', () => {
    expect(validateTx(tx)).toBe(true);
    expect(TransactionSchema.safeParse(tx).success).toBe(true);
    expect(validateSync(sync)).toBe(true);
    expect(SyncRequestSchema.safeParse(sync).success).toBe(true);
  });

  it.each([
    ['unknown type', { ...tx, type: 'LIPA_NA_MPESA' }],
    ['extra property', { ...tx, body: 'raw sms text' }],
    ['bad raw_hash', { ...tx, raw_hash: 'abc' }],
    ['missing parser', { ...tx, parser: undefined }],
    ['non-integer amount', { ...tx, amount_cents: 12.5 }],
    ['confidence out of range', { ...tx, parse_confidence: 1.5 }],
    ['bad uuid', { ...tx, id: 'not-a-uuid' }],
  ])('both reject: %s', (_name, bad) => {
    expect(validateTx(bad)).toBe(false);
    expect(TransactionSchema.safeParse(bad).success).toBe(false);
  });

  it('share every enum value', () => {
    const defs = transactionSchema['$defs'] as Record<string, { enum?: string[] }>;
    expect([...TX_TYPES]).toEqual(defs['TxType']!.enum);
    expect([...PROVIDERS]).toEqual(defs['Provider']!.enum);
    expect([...COUNTERPARTY_KINDS]).toEqual(defs['CounterpartyKind']!.enum);
    const factsDefs = factsSchema['$defs'] as Record<string, { properties: Record<string, { enum?: string[] }> }>;
    expect([...INSIGHT_KINDS]).toEqual(factsDefs['CandidateInsight']!.properties['kind']!.enum);
    const reportDefs = reportSchema['$defs'] as Record<string, { enum?: string[] }>;
    expect([...CHART_TYPES]).toEqual(reportDefs['ChartType']!.enum);
  });

  it('require the same Transaction, FactsSheet and ReportDocument keys', () => {
    const defs = transactionSchema['$defs'] as Record<string, { required: string[] }>;
    const zodRequired = Object.entries(TransactionSchema.shape)
      .filter(([, s]) => !(s as { safeParse: (v: unknown) => { success: boolean } }).safeParse(undefined).success)
      .map(([k]) => k)
      .sort();
    expect(zodRequired).toEqual([...defs['Transaction']!.required].sort());
    expect(Object.keys(FactsSheetSchema.shape).sort()).toEqual([...(factsSchema['required'] as string[])].sort());
    expect(Object.keys(ReportDocumentSchema.shape).sort()).toEqual([...(reportSchema['required'] as string[])].sort());
  });
});
