/**
 * "Examples are the tests": every family example must parse to its own family and match its `expect` object.
 * `expect` keys are compared against the flattened transaction (fields, type, direction, kind, hints).
 */
import { parseMessage } from './engine.js';
import type { CompiledPack } from './loader.js';
import type { ExtractedFields, ParseOutcome } from './types.js';

/** A fixed `received_at` for examples, so families without a date in the body get a deterministic `occurred_at`. */
export const EXAMPLE_RECEIVED_AT = '2026-01-15T09:00:00+03:00';
export const EXAMPLE_VARIABLES = { sim_msisdn_masked: '07XXXXX000', acct_mask: '***000' } as const;

export interface ExampleFailure {
  readonly family_id: string;
  readonly example_index: number;
  readonly problem: string;
}

export function flattenForExpect(outcome: ParseOutcome, pack: CompiledPack): Record<string, unknown> {
  if (outcome.kind === 'not_ours' || outcome.kind === 'unknown') return {};
  const f: ExtractedFields = outcome.fields;
  const family = pack.families.find((c) => c.family.family_id === outcome.family_id)!.family;
  const base: Record<string, unknown> = {
    family_id: outcome.family_id,
    external_ref: f.external_ref,
    amount_cents: f.amount_cents ?? 0,
    fee_cents: f.fee_cents ?? family.defaults?.fee_cents ?? 0,
    balance_after_cents: f.balance_after_cents,
    occurred_at: f.occurred_at,
    counterparty_name: f.counterparty_name ?? family.defaults?.counterparty_name ?? null,
    counterparty_ref: f.counterparty_ref,
    paybill: f.paybill,
    till: f.till,
    account_ref: f.account_ref,
    note: f.note,
    type: family.type,
    direction: family.direction,
    counterparty_kind: family.counterparty_kind,
    is_transfer_hint: family.is_transfer_hint === true,
    ignore: family.ignore === true,
    category_id: family.defaults?.category_id ?? null,
  };
  if (outcome.kind === 'parsed') {
    base.occurred_at = outcome.transaction.occurred_at;
    base.is_transfer = outcome.transaction.is_transfer;
  }
  return base;
}

/** Runs every example of every family in the pack; returns the failures (empty when the pack is green). */
export function runExamples(pack: CompiledPack): ExampleFailure[] {
  const failures: ExampleFailure[] = [];
  const sender = pack.pack.sender_ids[0]!;
  pack.families.forEach((compiled) => {
    compiled.family.examples.forEach((example, example_index) => {
      const fail = (problem: string) => failures.push({ family_id: compiled.family.family_id, example_index, problem });
      const outcome = parseMessage(pack, { sender, body: example.body, received_at: EXAMPLE_RECEIVED_AT }, { variables: EXAMPLE_VARIABLES });
      if (outcome.kind === 'unknown' || outcome.kind === 'not_ours') {
        fail(`no family matched (${outcome.kind})`);
        return;
      }
      if (outcome.family_id !== compiled.family.family_id) {
        fail(`matched family "${outcome.family_id}" instead (families are ordered; move the more specific one first)`);
        return;
      }
      const actual = flattenForExpect(outcome, pack);
      for (const [key, expected] of Object.entries(example.expect)) {
        if (!(key in actual)) {
          fail(`expect.${key} is not a comparable field (known: ${Object.keys(actual).join(', ')})`);
          continue;
        }
        if (JSON.stringify(actual[key]) !== JSON.stringify(expected)) {
          fail(`expect.${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual[key])}`);
        }
      }
    });
  });
  return failures;
}
