/**
 * What any engine (this one, the Kotlin one) must get from the demo inbox. Written next to the inbox so Lane A can
 * assert parity without running this package.
 */
import type { CorpusRunResult } from '../corpus.js';

export interface DemoExpectations {
  readonly messages: number;
  readonly parsed: number;
  readonly ignored: number;
  readonly unknown: number;
  readonly duplicates_dropped: number;
  readonly transactions_after_dedupe: number;
  readonly per_family: Record<string, number>;
  readonly transfer_pairs: {
    out_family: string;
    in_family: string;
    amount_cents: number;
    occurred_at: string;
  }[];
  readonly balance_chain: { checked: number; breaks: number };
  readonly per_account: Record<
    string,
    {
      transactions: number;
      in_cents: number;
      out_cents: number;
      fees_cents: number;
      last_balance_cents: number | null;
    }
  >;
}

export function expectationsFor(result: CorpusRunResult): DemoExpectations {
  const byId = new Map(result.post.transactions.map((t) => [t.id, t]));
  const perAccount: DemoExpectations['per_account'] = {};
  const sorted = [...result.post.transactions].sort(
    (a, b) =>
      Date.parse(a.occurred_at) - Date.parse(b.occurred_at) ||
      Date.parse(a.received_at) - Date.parse(b.received_at),
  );
  for (const t of sorted) {
    const acc = (perAccount[t.account_ref] ??= {
      transactions: 0,
      in_cents: 0,
      out_cents: 0,
      fees_cents: 0,
      last_balance_cents: null,
    });
    acc.transactions += 1;
    if (t.direction === 'in') acc.in_cents += t.amount_cents;
    if (t.direction === 'out') acc.out_cents += t.amount_cents;
    acc.fees_cents += t.fee_cents;
    if (t.balance_after_cents !== null) acc.last_balance_cents = t.balance_after_cents;
  }
  return {
    messages: result.total,
    parsed: result.parsed,
    ignored: result.ignored,
    unknown: result.unknown.length,
    duplicates_dropped: result.post.duplicates,
    transactions_after_dedupe: result.post.transactions.length,
    per_family: Object.fromEntries([...result.per_family.entries()].sort()),
    transfer_pairs: result.post.transfer_pairs.map((p) => {
      const out = byId.get(p.out_id)!;
      return {
        out_family: out.parser.family_id,
        in_family: byId.get(p.in_id)!.parser.family_id,
        amount_cents: out.amount_cents,
        occurred_at: out.occurred_at,
      };
    }),
    balance_chain: {
      checked: result.post.balance.checked,
      breaks: result.post.balance.breaks.length,
    },
    per_account: perAccount,
  };
}
