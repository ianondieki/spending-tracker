/**
 * Message evaluation (PROVIDER-PACKS.md §1–§7): sender filter → families in order (prefilter, then pattern) →
 * field mapping and normalisation → a Transaction. One message, one outcome.
 */
import { deterministicUuid, sha256Hex } from './hash.js';
import type { CompiledFamily, CompiledPack } from './loader.js';
import {
  maskAccountRef,
  normaliseAmount,
  normaliseCode,
  normaliseDatetime,
  normaliseDigits,
  normalisePhone,
  normaliseText,
} from './normalise.js';
import type { ExtractedFields, FieldSpec, ParseOutcome, RawMessage, Transaction } from './types.js';

export interface EngineOptions {
  /** Values for `account_ref_template` variables such as `sim_msisdn_masked`; they come from the device, never the message. */
  readonly variables?: Readonly<Record<string, string>>;
}

const DEFAULT_CONFIDENCE = 0.95;

/** The body as both engines must see it before matching: U+00A0 (no-break space) becomes a plain space, because Java's \\s excludes it and JavaScript's includes it. */
export function matchableBody(body: string): string {
  return body.replace(/ /g, ' ');
}

export function senderMatches(pack: CompiledPack, sender: string): boolean {
  return pack.senderIds.has(sender.trim().toLowerCase());
}

export function parseMessage(pack: CompiledPack, message: RawMessage, options: EngineOptions = {}): ParseOutcome {
  if (!senderMatches(pack, message.sender)) return { kind: 'not_ours' };
  const body = matchableBody(message.body);
  const lower = body.toLowerCase();
  const rawHash = sha256Hex(message.body);

  for (const compiled of pack.families) {
    if (!compiled.allOf.every((s) => lower.includes(s))) continue;
    if (compiled.noneOf.some((s) => lower.includes(s))) continue;
    const m = compiled.regex.exec(body);
    if (!m) continue;
    const fields = extractFields(pack, compiled, m.groups ?? {});
    if (!fields) continue; // a required group failed to normalise: try the next family
    const { family } = compiled;
    if (family.ignore) return { kind: 'ignored', family_id: family.family_id, fields, raw_hash: rawHash };
    const transaction = buildTransaction(pack, compiled, fields, message, rawHash, options);
    if (!transaction) continue;
    return {
      kind: 'parsed',
      family_id: family.family_id,
      fields,
      transaction,
      is_transfer_hint: family.is_transfer_hint === true,
    };
  }
  return { kind: 'unknown', sender: message.sender, raw_hash: rawHash };
}

function extractFields(
  pack: CompiledPack,
  compiled: CompiledFamily,
  groups: Record<string, string | undefined>,
): ExtractedFields | null {
  const out: ExtractedFields = {
    external_ref: null,
    amount_cents: null,
    fee_cents: null,
    balance_after_cents: null,
    occurred_at: null,
    counterparty_name: null,
    counterparty_ref: null,
    paybill: null,
    till: null,
    account_ref: null,
    note: null,
  };
  for (const [group, spec] of Object.entries(compiled.family.fields)) {
    const raw = groups[group];
    const value = raw === undefined ? null : normalise(raw, spec, pack);
    if (value === null) {
      if (spec.optional) continue;
      return null;
    }
    assign(out, spec, value);
  }
  return out;
}

function normalise(raw: string, spec: FieldSpec, pack: CompiledPack): string | number | null {
  switch (spec.normalise) {
    case 'amount':
      return normaliseAmount(raw, pack.pack.amount_prefixes);
    case 'datetime':
      return normaliseDatetime(raw, pack.pack.datetime_formats);
    case 'text':
      return normaliseText(raw);
    case 'phone':
      return normalisePhone(raw);
    case 'code':
      return normaliseCode(raw);
    case 'digits':
      return normaliseDigits(raw);
  }
}

function assign(out: ExtractedFields, spec: FieldSpec, value: string | number): void {
  const str = typeof value === 'number' ? String(value) : value;
  switch (spec.to) {
    case 'amount':
      if (typeof value === 'number') out.amount_cents = value;
      break;
    case 'fee':
      if (typeof value === 'number') out.fee_cents = value;
      break;
    case 'balance_after':
      if (typeof value === 'number') out.balance_after_cents = value;
      break;
    case 'external_ref':
      out.external_ref = str;
      break;
    case 'occurred_at':
      out.occurred_at = str;
      break;
    case 'counterparty_name':
      out.counterparty_name = str;
      break;
    case 'counterparty_ref':
      out.counterparty_ref = str;
      break;
    case 'paybill':
      out.paybill = str;
      break;
    case 'till':
      out.till = str;
      break;
    case 'account_ref':
      out.account_ref = maskAccountRef(str);
      break;
    case 'note':
      out.note = str;
      break;
  }
}

export function renderAccountRef(template: string, variables: Readonly<Record<string, string>>): string {
  return template.replace(/\{([a-z0-9_]+)\}/g, (_, name: string) => {
    const value = variables[name];
    if (value === undefined) throw new Error(`account_ref_template needs variable "${name}"`);
    return value;
  });
}

function buildTransaction(
  pack: CompiledPack,
  compiled: CompiledFamily,
  fields: ExtractedFields,
  message: RawMessage,
  rawHash: string,
  options: EngineOptions,
): Transaction | null {
  const { family } = compiled;
  if (fields.amount_cents === null) return null;
  const accountRef = renderAccountRef(pack.pack.account_ref_template, options.variables ?? {});
  const occurredAt = fields.occurred_at ?? message.received_at;
  const categoryId = family.defaults?.category_id ?? null;
  return {
    id: deterministicUuid(`${pack.pack.pack_id}|${family.family_id}|${rawHash}`),
    account_ref: accountRef,
    provider: pack.pack.provider,
    external_ref: fields.external_ref,
    type: family.type,
    direction: family.direction,
    amount_cents: fields.amount_cents,
    fee_cents: fields.fee_cents ?? family.defaults?.fee_cents ?? 0,
    balance_after_cents: fields.balance_after_cents,
    occurred_at: occurredAt,
    received_at: message.received_at,
    counterparty: {
      name: fields.counterparty_name ?? family.defaults?.counterparty_name ?? null,
      kind: family.counterparty_kind,
      ref_masked: fields.counterparty_ref,
      paybill: fields.paybill,
      till: fields.till,
      account_ref: fields.account_ref,
    },
    category_id: categoryId,
    category_source: categoryId ? 'provider_default' : 'none',
    category_confidence: categoryId ? 0.9 : 0,
    is_transfer: false,
    transfer_pair_id: null,
    parse_confidence: family.confidence ?? DEFAULT_CONFIDENCE,
    source: 'sms',
    raw_hash: rawHash,
    parser: { pack_id: pack.pack.pack_id, pack_version: pack.pack.version, family_id: family.family_id },
    user_edited: false,
    note: fields.note,
    tags: [],
    updated_at: message.received_at,
  };
}

/** Runs one message through several packs; the first pack whose sender list contains the sender decides. */
export function parseWithPacks(packs: readonly CompiledPack[], message: RawMessage, options?: EngineOptions): ParseOutcome {
  for (const pack of packs) {
    if (senderMatches(pack, message.sender)) return parseMessage(pack, message, options);
  }
  return { kind: 'not_ours' };
}
