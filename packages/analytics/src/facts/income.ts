import type { IncomeFact } from '../contracts/facts-sheet.js';
import { count, money, sumMinor } from '../money.js';
import type { Tx } from './prepare.js';
import { groupBy } from './util.js';

const BUSINESS_KINDS: ReadonlySet<string> = new Set(['merchant', 'paybill', 'till', 'bank']);

/** person > refund > salary > business > other, decided on the first transaction of the source. */
export function incomeKind(t: Tx): IncomeFact['kind'] {
  const name = t.name ?? '';
  if (t.cpKind === 'person') return 'person';
  if (/refund|reversal/i.test(name)) return 'refund';
  if (/salary|payroll|wages/i.test(name)) return 'salary';
  if (BUSINESS_KINDS.has(t.cpKind)) return 'business';
  return 'other';
}

/**
 * Income grouped by normalised counterparty name, sorted by amount desc. A nameless counterparty with a masked
 * reference is grouped (and shown) by that reference; anything else without a name is "Unknown".
 */
export function buildIncome(incomeTxs: readonly Tx[]): IncomeFact[] {
  const facts: (IncomeFact & { cents: number })[] = [];
  for (const txs of groupBy(incomeTxs, (t) => t.key ?? (t.refMasked === null ? '' : `ref:${t.refMasked}`)).values()) {
    const first = txs[0];
    if (!first) continue;
    const cents = sumMinor(txs.map((t) => t.amount));
    facts.push({ source: first.name ?? first.refMasked ?? 'Unknown', kind: incomeKind(first), in: money(cents), count: count(txs.length), cents });
  }
  return facts.sort((a, b) => b.cents - a.cents).map(({ cents: _cents, ...fact }) => fact);
}
