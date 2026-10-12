/**
 * Zod mirror of `contracts/transaction.schema.json` (frozen). Keep field order and constraints identical to
 * the JSON schema; `apps/api` has an ajv test that cross-checks the two.
 */
import { z } from 'zod';

export const PROVIDERS = ['mpesa', 'airtel_money', 'tkash', 'bank', 'card', 'wallet', 'unknown'] as const;
export const ProviderSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof ProviderSchema>;

export const TX_TYPES = [
  'SEND_MONEY', 'RECEIVE_MONEY', 'PAYBILL', 'BUY_GOODS', 'WITHDRAW', 'DEPOSIT', 'AIRTIME',
  'FULIZA_DRAWDOWN', 'FULIZA_REPAY', 'MSHWARI_DEPOSIT', 'MSHWARI_WITHDRAW', 'MSHWARI_LOAN', 'MSHWARI_LOAN_REPAY',
  'KCB_MPESA', 'BANK_TO_MPESA', 'MPESA_TO_BANK', 'POCHI', 'GLOBAL_SEND', 'REVERSAL',
  'DEBIT', 'CREDIT', 'CARD_PURCHASE', 'ATM', 'FEE', 'LOAN_REPAY', 'STANDING_ORDER', 'INTERNAL_TRANSFER',
  'BALANCE_QUERY', 'FAILED', 'OTHER',
] as const;
export const TxTypeSchema = z.enum(TX_TYPES);
export type TxType = z.infer<typeof TxTypeSchema>;

export const COUNTERPARTY_KINDS = ['person', 'merchant', 'paybill', 'till', 'agent', 'bank', 'self', 'unknown'] as const;
export const CounterpartyKindSchema = z.enum(COUNTERPARTY_KINDS);
export type CounterpartyKind = z.infer<typeof CounterpartyKindSchema>;

/** KES cents. */
export const MoneyCentsSchema = z.number().int();

const dateTime = z.iso.datetime({ offset: true });

export const CounterpartySchema = z.strictObject({
  name: z.string().max(120).nullable().optional(),
  kind: CounterpartyKindSchema,
  ref_masked: z.string().nullable().optional(),
  paybill: z.string().nullable().optional(),
  till: z.string().nullable().optional(),
  account_ref: z.string().nullable().optional(),
});
export type Counterparty = z.infer<typeof CounterpartySchema>;

export const DIRECTIONS = ['in', 'out', 'none'] as const;
export const CATEGORY_SOURCES = ['rule', 'merchant', 'provider_default', 'model', 'user', 'none'] as const;
export const TX_SOURCES = ['sms', 'notification', 'import', 'manual', 'share'] as const;

export const TransactionSchema = z.strictObject({
  id: z.uuid(),
  account_ref: z.string(),
  provider: ProviderSchema,
  external_ref: z.string().nullable().optional(),
  type: TxTypeSchema,
  direction: z.enum(DIRECTIONS),
  amount_cents: MoneyCentsSchema,
  fee_cents: MoneyCentsSchema,
  balance_after_cents: z.number().int().nullable().optional(),
  occurred_at: dateTime,
  received_at: dateTime,
  counterparty: CounterpartySchema,
  category_id: z.string().nullable().optional(),
  category_source: z.enum(CATEGORY_SOURCES),
  category_confidence: z.number().min(0).max(1).optional(),
  is_transfer: z.boolean(),
  transfer_pair_id: z.uuid().nullable().optional(),
  parse_confidence: z.number().min(0).max(1),
  source: z.enum(TX_SOURCES),
  raw_hash: z.string().regex(/^[a-f0-9]{64}$/),
  parser: z.strictObject({ pack_id: z.string(), pack_version: z.string(), family_id: z.string() }),
  user_edited: z.boolean(),
  note: z.string().max(500).nullable().optional(),
  tags: z.array(z.string()).max(20).optional(),
  updated_at: dateTime,
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const AccountSchema = z.strictObject({
  account_ref: z.string(),
  provider: ProviderSchema,
  institution: z.string().nullable().optional(),
  label: z.string(),
  mask: z.string().nullable().optional(),
  last_balance_cents: z.number().int().nullable().optional(),
  last_balance_at: dateTime.nullable().optional(),
});
export type Account = z.infer<typeof AccountSchema>;

export const SyncRequestSchema = z.strictObject({
  device_id: z.string(),
  app_version: z.string(),
  parser_version: z.string(),
  accounts: z.array(AccountSchema),
  transactions: z.array(TransactionSchema).max(500),
  unknown_message_count: z.number().int().min(0),
  sent_at: dateTime,
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncResponseSchema = z.strictObject({
  accepted: z.number().int(),
  rejected: z.array(z.object({ id: z.string(), reason: z.string() })),
  server_time: dateTime,
  next_report_at: dateTime.nullable().optional(),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
