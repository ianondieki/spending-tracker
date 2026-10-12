/** Categories, merchants, people and accounts for one period. */
import type { AccountFact, CategoryFact, MerchantFact, Period, PersonFact } from '../contracts/facts-sheet.js';
import type { Account } from '../contracts/transaction.js';
import { count, delta, money, pct, ratioPct, sumMinor } from '../money.js';
import { isCashLike, MERCHANT_KINDS } from './classify.js';
import { UNCATEGORISED, type Tx } from './prepare.js';
import type { CategoryInfo } from './types.js';
import { drill, groupBy } from './util.js';

export interface CategoryNames {
  readonly en: string;
  readonly sw: string;
}

export type CategoryNamer = (id: string) => CategoryNames;

export function categoryNamer(categories: readonly CategoryInfo[]): CategoryNamer {
  const byId = new Map<string, CategoryNames>();
  for (const c of categories) byId.set(c.id, { en: c.name_en, sw: c.name_sw });
  return (id) => byId.get(id) ?? (id === UNCATEGORISED ? { en: 'Uncategorised', sw: 'Bila kundi' } : { en: id, sw: id });
}

/** A payment to a place: merchant kinds only, never an agent withdrawal, a person or a transfer. */
export const isMerchantTx = (t: Tx): boolean => MERCHANT_KINDS.has(t.cpKind) && t.key !== null && !isCashLike(t);
export const isPersonTx = (t: Tx): boolean => t.cpKind === 'person' && (t.key !== null || t.refMasked !== null);
export const personKey = (t: Tx): string | null => t.key ?? (t.refMasked === null ? null : `ref:${t.refMasked}`);

/** Spending grouped by normalised merchant name, sorted by out desc (ties keep first-seen order). */
export interface MerchantAgg {
  readonly key: string;
  readonly name: string;
  readonly out: number;
  readonly count: number;
  readonly categoryId: string;
  readonly txs: readonly Tx[];
}

export function merchantAggs(spend: readonly Tx[]): MerchantAgg[] {
  const groups = groupBy(spend.filter(isMerchantTx), (t) => t.key);
  const aggs: MerchantAgg[] = [];
  for (const [key, txs] of groups) {
    const first = txs[0];
    if (!first) continue;
    const byCat = new Map<string, number>();
    for (const t of txs) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
    let categoryId = first.categoryId;
    let best = -1;
    for (const [cat, out] of byCat) {
      if (out > best) {
        best = out;
        categoryId = cat;
      }
    }
    aggs.push({ key, name: first.name ?? key, out: sumMinor(txs.map((t) => t.amount)), count: txs.length, categoryId, txs });
  }
  return aggs.sort((a, b) => b.out - a.out);
}

export interface CategoryAgg {
  readonly id: string;
  readonly out: number;
  readonly count: number;
  readonly topMerchant: string | null;
}

/** Spending per category in first-seen order (unsorted). */
export function categoryAggs(spend: readonly Tx[]): Map<string, CategoryAgg> {
  const result = new Map<string, CategoryAgg>();
  for (const [id, txs] of groupBy(spend, (t) => t.categoryId)) {
    const top = merchantAggs(txs)[0];
    result.set(id, { id, out: sumMinor(txs.map((t) => t.amount)), count: txs.length, topMerchant: top ? top.name : null });
  }
  return result;
}

export function buildCategories(
  current: ReadonlyMap<string, CategoryAgg>,
  previous: ReadonlyMap<string, CategoryAgg>,
  totalOut: number,
  period: Period,
  names: CategoryNamer,
): CategoryFact[] {
  return [...current.values()]
    .filter((c) => c.out > 0)
    .sort((a, b) => b.out - a.out)
    .map((c) => {
      const n = names(c.id);
      return {
        category_id: c.id,
        name_en: n.en,
        name_sw: n.sw,
        out: money(c.out),
        share: pct(ratioPct(c.out, totalOut)),
        delta: delta(c.out, previous.get(c.id)?.out ?? 0),
        count: count(c.count),
        top_merchant: c.topMerchant,
        drilldown: drill({ from: period.start, to: period.end, category_id: c.id, direction: 'out' }),
      };
    });
}

export function merchantFact(m: MerchantAgg, isNew: boolean, period: Period): MerchantFact {
  return {
    name: m.name,
    category_id: m.categoryId,
    out: money(m.out),
    count: count(m.count),
    is_new: isNew,
    drilldown: drill({ from: period.start, to: period.end, merchant: m.name }),
  };
}

export interface PersonAgg {
  readonly key: string;
  readonly name: string;
  readonly ref: string | null;
  readonly sent: number;
  readonly received: number;
  readonly count: number;
}

/** People: `person` counterparties, spending out (sent) and income in (received); sorted by sent + received. */
export function personAggs(periodTxs: readonly Tx[]): PersonAgg[] {
  const relevant = periodTxs.filter((t) => isPersonTx(t) && (t.cls === 'spend' || t.cls === 'income'));
  const aggs: PersonAgg[] = [];
  for (const [key, txs] of groupBy(relevant, personKey)) {
    const first = txs[0];
    if (!first) continue;
    const ref = txs.find((t) => t.refMasked !== null)?.refMasked ?? null;
    aggs.push({
      key,
      name: first.name ?? first.refMasked ?? key,
      ref,
      sent: sumMinor(txs.filter((t) => t.cls === 'spend').map((t) => t.amount)),
      received: sumMinor(txs.filter((t) => t.cls === 'income').map((t) => t.amount)),
      count: txs.length,
    });
  }
  return aggs.sort((a, b) => b.sent + b.received - (a.sent + a.received));
}

export function personFact(p: PersonAgg, period: Period): PersonFact {
  return {
    name: p.name,
    ref_masked: p.ref,
    sent: money(p.sent),
    received: money(p.received),
    count: count(p.count),
    drilldown: drill(
      p.ref !== null
        ? { from: period.start, to: period.end, counterparty_ref: p.ref }
        : { from: period.start, to: period.end, merchant: p.name },
    ),
  };
}

/**
 * One row per supplied account (in the order given), then any account_ref seen in the period but not supplied.
 * in/out/fees use the same rules as the totals, so the rows add up to totals.in/out/fees.
 */
export function buildAccounts(accounts: readonly Account[], windowTxs: readonly Tx[], periodTxs: readonly Tx[]): AccountFact[] {
  const rows: { ref: string; label: string; provider: string; account: Account | null }[] = accounts.map((a) => ({
    ref: a.account_ref,
    label: a.label,
    provider: a.provider,
    account: a,
  }));
  const known = new Set(rows.map((r) => r.ref));
  for (const t of periodTxs) {
    if (known.has(t.src.account_ref)) continue;
    known.add(t.src.account_ref);
    rows.push({ ref: t.src.account_ref, label: t.src.account_ref, provider: t.src.provider, account: null });
  }
  return rows.map((r) => {
    const own = periodTxs.filter((t) => t.src.account_ref === r.ref);
    let last: Tx | null = null;
    for (const t of windowTxs) if (t.src.account_ref === r.ref && t.balance !== null) last = t;
    let balance: AccountFact['balance'] = null;
    let balanceAt: string | null = null;
    if (last !== null && last.balance !== null) {
      balance = money(last.balance);
      balanceAt = last.src.occurred_at;
    } else if (r.account?.last_balance_cents != null) {
      balance = money(r.account.last_balance_cents);
      balanceAt = r.account.last_balance_at ?? null;
    }
    return {
      account_ref: r.ref,
      label: r.label,
      provider: r.provider,
      balance,
      balance_at: balanceAt,
      in: money(sumMinor(own.filter((t) => t.cls === 'income').map((t) => t.amount))),
      out: money(sumMinor(own.filter((t) => t.cls === 'spend').map((t) => t.amount))),
      fees: money(sumMinor(own.map((t) => t.feeTotal))),
      balance_series: own.flatMap((t) => (t.balance === null ? [] : [{ at: t.src.occurred_at, cents: t.balance }])),
    };
  });
}
