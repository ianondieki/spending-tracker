/**
 * Types mirroring `contracts/provider-pack.schema.json` (the pack) and the Transaction object of
 * `contracts/transaction.schema.json` (the engine's output). The JSON schemas stay authoritative; a pack is
 * validated against the schema at load time before any of these types are trusted.
 */

export type Provider = 'mpesa' | 'airtel_money' | 'tkash' | 'bank' | 'card' | 'wallet';
export type Direction = 'in' | 'out' | 'none';
export type CounterpartyKind = 'person' | 'merchant' | 'paybill' | 'till' | 'agent' | 'bank' | 'self' | 'unknown';

export type FieldTarget =
  | 'external_ref'
  | 'amount'
  | 'fee'
  | 'balance_after'
  | 'occurred_at'
  | 'counterparty_name'
  | 'counterparty_ref'
  | 'paybill'
  | 'till'
  | 'account_ref'
  | 'note';

export type Normaliser = 'amount' | 'datetime' | 'text' | 'phone' | 'code' | 'digits';

export interface FieldSpec {
  readonly to: FieldTarget;
  readonly normalise: Normaliser;
  readonly optional?: boolean;
}

export interface FamilyDefaults {
  readonly fee_cents?: number;
  readonly counterparty_name?: string;
  readonly category_id?: string;
}

export interface Prefilter {
  readonly all_of?: readonly string[];
  readonly none_of?: readonly string[];
}

export interface FamilyExample {
  readonly body: string;
  readonly verified: boolean;
  readonly expect: Readonly<Record<string, unknown>> & { readonly amount_cents: number };
}

export interface Family {
  readonly family_id: string;
  readonly description: string;
  readonly type: string;
  readonly direction: Direction;
  readonly counterparty_kind: CounterpartyKind;
  readonly is_transfer_hint?: boolean;
  readonly ignore?: boolean;
  readonly prefilter?: Prefilter;
  readonly pattern: string;
  readonly fields: Readonly<Record<string, FieldSpec>>;
  readonly defaults?: FamilyDefaults;
  readonly confidence?: number;
  readonly examples: readonly FamilyExample[];
}

export interface ProviderPack {
  readonly pack_id: string;
  readonly version: string;
  readonly provider: Provider;
  readonly institution?: string | null;
  readonly sender_ids: readonly string[];
  readonly account_ref_template: string;
  readonly currency: 'KES';
  readonly datetime_formats: readonly string[];
  readonly amount_prefixes: readonly string[];
  readonly families: readonly Family[];
}

/** A message as the engine receives it: the sender address, the body and when the device received it. */
export interface RawMessage {
  readonly sender: string;
  readonly body: string;
  /** ISO 8601 with offset. Used for `occurred_at` when the family carries no date, and as `received_at`. */
  readonly received_at: string;
}

export interface Counterparty {
  name: string | null;
  kind: CounterpartyKind;
  ref_masked: string | null;
  paybill: string | null;
  till: string | null;
  account_ref: string | null;
}

export type CategorySource = 'rule' | 'merchant' | 'provider_default' | 'model' | 'user' | 'none';

/** One row of `contracts/transaction.schema.json#/$defs/Transaction`. */
export interface Transaction {
  id: string;
  account_ref: string;
  provider: Provider | 'unknown';
  external_ref: string | null;
  type: string;
  direction: Direction;
  amount_cents: number;
  fee_cents: number;
  balance_after_cents: number | null;
  occurred_at: string;
  received_at: string;
  counterparty: Counterparty;
  category_id: string | null;
  category_source: CategorySource;
  category_confidence: number;
  is_transfer: boolean;
  transfer_pair_id: string | null;
  parse_confidence: number;
  source: 'sms' | 'notification' | 'import' | 'manual' | 'share';
  raw_hash: string;
  parser: { pack_id: string; pack_version: string; family_id: string };
  user_edited: boolean;
  note: string | null;
  tags: string[];
  updated_at: string;
}

/** The fields a family extracted, after normalisation, before they become a Transaction. */
export interface ExtractedFields {
  external_ref: string | null;
  amount_cents: number | null;
  fee_cents: number | null;
  balance_after_cents: number | null;
  occurred_at: string | null;
  counterparty_name: string | null;
  counterparty_ref: string | null;
  paybill: string | null;
  till: string | null;
  account_ref: string | null;
  note: string | null;
}

export type ParseOutcome =
  | { kind: 'not_ours' }
  | { kind: 'unknown'; sender: string; raw_hash: string }
  | { kind: 'ignored'; family_id: string; fields: ExtractedFields; raw_hash: string }
  | { kind: 'parsed'; family_id: string; fields: ExtractedFields; transaction: Transaction; is_transfer_hint: boolean };

export interface ParsedTransaction {
  readonly transaction: Transaction;
  readonly family_id: string;
  readonly is_transfer_hint: boolean;
}
