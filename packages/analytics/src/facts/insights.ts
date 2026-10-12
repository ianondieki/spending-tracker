/**
 * Candidate insights: every fact pattern that applies, with params that are display strings, names, ISO dates
 * or small enums only (never raw numbers). The i18n templates and the numbers-only fallback key on `kind` and
 * on these exact param names.
 */
import type {
  AccountFact, BudgetFact, CandidateInsight, CategoryFact, Delta, Drilldown, InsightKind, Period, Totals,
} from '../contracts/facts-sheet.js';
import { count, delta, formatMoney, formatPct, sumMinor } from '../money.js';
import { addDays, isoMidnight, isoDate, toLocalDate } from '../period.js';
import type { CategoryAgg, CategoryNamer, MerchantAgg, PersonAgg } from './breakdowns.js';
import type { DayRow } from './days.js';
import type { DuplicateFound, UnusualFound } from './anomalies.js';
import type { OverdraftRaw } from './overdraft.js';
import type { Tx } from './prepare.js';
import type { RecurringItem } from './recurring.js';
import type { RawTotals } from './totals.js';
import type { FactsInput } from './types.js';
import { divRound, drill, mulSafe } from './util.js';

const SEVERITY_RANK: Record<CandidateInsight['severity'], number> = { important: 0, notable: 1, info: 2 };

export const KSH_200 = 20_000;
export const KSH_500 = 50_000;

export interface InsightContext {
  readonly input: FactsInput;
  readonly period: Period;
  /** First instant after the next period (the "due next period" window is [period.end, nextEnd)). */
  readonly nextEndMs: number;
  readonly cur: RawTotals;
  readonly prev: RawTotals;
  readonly totals: Totals;
  readonly previousTotals: Totals;
  readonly deltaOut: Delta;
  readonly categories: readonly CategoryFact[];
  readonly curCats: ReadonlyMap<string, CategoryAgg>;
  readonly prevCats: ReadonlyMap<string, CategoryAgg>;
  readonly names: CategoryNamer;
  readonly newMerchants: readonly MerchantAgg[];
  readonly people: readonly PersonAgg[];
  readonly largest: readonly Tx[];
  readonly periodTxs: readonly Tx[];
  readonly spend: readonly Tx[];
  readonly spendiest: DayRow | null;
  readonly weekendOut: number;
  readonly weekdayOut: number;
  readonly weekendShare: number;
  readonly nightSpend: readonly Tx[];
  readonly budgets: readonly BudgetFact[];
  readonly recurring: readonly RecurringItem[];
  readonly overdraft: OverdraftRaw;
  readonly accounts: readonly AccountFact[];
  readonly duplicates: readonly DuplicateFound[];
  readonly unusual: readonly UnusualFound[];
  readonly income: readonly { readonly source: string }[];
}

export function buildInsights(ctx: InsightContext): CandidateInsight[] {
  const { period, cur, prev, totals, names } = ctx;
  const range = { from: period.start, to: period.end };
  const list: CandidateInsight[] = [];
  const add = (kind: InsightKind, id: string, severity: CandidateInsight['severity'], params: CandidateInsight['params'], drilldown: Drilldown) =>
    list.push({ id, kind, severity, params, drilldown });
  const catDrill = (id: string) => drill({ ...range, category_id: id, direction: 'out' });
  const catParams = (id: string) => {
    const n = names(id);
    return { category_id: id, category_en: n.en, category_sw: n.sw };
  };

  // spend_vs_last (always)
  add('spend_vs_last', 'spend_vs_last', Math.abs(ctx.deltaOut.pct.value) >= 20 ? 'notable' : 'info', {
    out: totals.out.display,
    previous_out: ctx.previousTotals.out.display,
    delta: ctx.deltaOut.display,
    delta_pct: ctx.deltaOut.pct.display,
    direction: ctx.deltaOut.direction,
  }, drill({ ...range, direction: 'out' }));

  const top = ctx.categories[0];
  if (top && top.out.cents > 0) {
    add('top_category', `top_category:${top.category_id}`, 'info', {
      ...catParams(top.category_id), out: top.out.display, share: top.share.display,
    }, top.drilldown);
  }

  // Insight params are never null: the i18n renderer fails closed on a missing value, so an insight whose
  // counterparty is unknown (airtime, a nameless card row) is not emitted; largest[0] still carries the fact.
  const big = ctx.largest[0];
  const bigWho = big ? (big.name ?? big.refMasked) : null;
  if (big && bigWho !== null) {
    add('biggest_transaction', `biggest_transaction:${big.id}`, 'info', {
      amount: formatMoney(big.amount), counterparty: bigWho, date: big.dateKey, category_id: big.categoryId,
    }, drill({ transaction_ids: [big.id] }));
  }

  for (const m of ctx.newMerchants.slice(0, 3)) {
    add('new_merchant', `new_merchant:${m.name}`, 'info', {
      merchant: m.name, out: formatMoney(m.out), count: count(m.count).display,
    }, drill({ ...range, merchant: m.name }));
  }

  for (const d of ctx.duplicates) {
    const ids = d.txs.map((t) => t.id);
    add('duplicate_payment', `duplicate_payment:${ids[0] ?? ''}`, 'important', {
      merchant: d.merchant, amount: formatMoney(d.amount), count: count(d.txs.length).display,
    }, drill({ transaction_ids: ids }));
  }

  for (const u of ctx.unusual) {
    add('unusual_amount', `unusual_amount:${u.tx.id}`, 'notable', {
      merchant: u.merchant, amount: formatMoney(u.tx.amount), typical: formatMoney(u.typical),
    }, drill({ transaction_ids: [u.tx.id] }));
  }

  if (cur.fees > 0) {
    const feeTxs = ctx.periodTxs.filter((t) => t.fee > 0 || t.src.type === 'FEE');
    add('fees_total', 'fees_total', 'info', {
      fees: totals.fees.display, fee_ratio: totals.fee_ratio.display, count: count(feeTxs.length).display,
    }, drill({ ...range, transaction_ids: feeTxs.map((t) => t.id) }));
  }

  if (cur.out > 0 && prev.out > 0) {
    const now = totals.fee_ratio.value;
    const before = ctx.previousTotals.fee_ratio.value;
    if (Math.abs(now - before) >= 2) {
      add('fee_ratio_change', 'fee_ratio_change', now > before ? 'notable' : 'info', {
        fee_ratio: formatPct(now), previous_fee_ratio: formatPct(before), direction: now > before ? 'up' : 'down',
      }, drill({ ...range }));
    }
  }

  const od = ctx.overdraft;
  if (od.drawdown > 0) {
    add('fuliza_usage', 'fuliza_usage', od.cost >= KSH_200 ? 'important' : 'notable', {
      drawdown: formatMoney(od.drawdown), repaid: formatMoney(od.repaid), cost: formatMoney(od.cost), days: count(od.days).display,
    }, drill({ ...range, types: ['FULIZA_DRAWDOWN', 'FULIZA_REPAY'] }));
  }

  if (cur.cash > 0) {
    const cash = ctx.spend.filter((t) => t.src.type === 'WITHDRAW' || t.src.type === 'ATM');
    add('cash_withdrawn', 'cash_withdrawn', 'info', {
      amount: totals.cash_withdrawn.display, count: count(cash.length).display,
    }, drill({ ...range, types: ['WITHDRAW', 'ATM'], direction: 'out' }));
  }

  if (cur.in > 0 && cur.savings > 0) {
    add('savings_rate', 'savings_rate', 'info', {
      rate: totals.savings_rate.display, savings: totals.savings_out.display, income: totals.in.display,
    }, drill({ ...range, types: ['MSHWARI_DEPOSIT'], direction: 'out' }));
  }

  if (cur.in > 0) {
    const incomeTxs = ctx.periodTxs.filter((t) => t.cls === 'income');
    add('income_received', 'income_received', 'info', {
      income: totals.in.display, count: count(incomeTxs.length).display, top_source: ctx.income[0]?.source ?? 'Unknown',
    }, drill({ ...range, transaction_ids: incomeTxs.map((t) => t.id) }));
  }

  const sentTo = ctx.people.filter((p) => p.sent > 0);
  const topPerson = [...sentTo].sort((a, b) => b.sent - a.sent)[0];
  if (topPerson) {
    const sentTxs = ctx.spend.filter((t) => t.cpKind === 'person');
    add('sent_to_people', 'sent_to_people', 'info', {
      total: formatMoney(sumMinor(sentTo.map((p) => p.sent))),
      count: count(sentTo.length).display,
      top_person: topPerson.name,
      top_amount: formatMoney(topPerson.sent),
    }, drill({ ...range, transaction_ids: sentTxs.map((t) => t.id) }));
  }

  const sd = ctx.spendiest;
  if (sd) {
    add('spendiest_day', `spendiest_day:${sd.fact.date}`, 'info', {
      weekday_en: sd.fact.weekday_en, weekday_sw: sd.fact.weekday_sw, date: sd.fact.date, out: sd.fact.out.display,
    }, drill({ from: isoMidnight(sd.date), to: isoMidnight(addDays(sd.date, 1)), direction: 'out' }));
  }

  if (cur.out > 0) {
    add('weekend_share', 'weekend_share', ctx.weekendShare >= 40 ? 'notable' : 'info', {
      share: formatPct(ctx.weekendShare), weekend_out: formatMoney(ctx.weekendOut), weekday_out: formatMoney(ctx.weekdayOut),
    }, drill({ ...range, direction: 'out' }));
  }

  const nightOut = sumMinor(ctx.nightSpend.map((t) => t.amount));
  if (nightOut > 0) {
    add('late_night_spend', 'late_night_spend', 'info', {
      out: formatMoney(nightOut), count: count(ctx.nightSpend.length).display,
    }, drill({ ...range, transaction_ids: ctx.nightSpend.map((t) => t.id) }));
  }

  for (const b of ctx.budgets) {
    if (b.status === 'watch') {
      add('budget_at_risk', `budget_at_risk:${b.category_id}`, 'notable', {
        ...catParams(b.category_id), spent: b.spent.display, limit: b.limit.display, projected: b.projected.display, used: b.used.display,
      }, catDrill(b.category_id));
    }
  }
  for (const b of ctx.budgets) {
    if (b.status === 'over') {
      add('budget_over', `budget_over:${b.category_id}`, 'important', {
        ...catParams(b.category_id), spent: b.spent.display, limit: b.limit.display, used: b.used.display,
      }, catDrill(b.category_id));
    }
  }

  const endMs = Date.parse(period.end);
  for (const r of ctx.recurring) {
    if (r.fact.is_subscription && r.nextMs !== null && r.nextMs >= endMs && r.nextMs < ctx.nextEndMs) {
      add('subscription_due', `subscription_due:${r.fact.merchant}`, 'info', {
        merchant: r.fact.merchant, amount: r.fact.typical_amount.display, next_expected: isoDate(toLocalDate(r.nextMs)),
      }, r.fact.drilldown);
    }
  }
  for (const r of ctx.recurring.filter((x) => !x.fact.is_subscription && x.fact.cadence !== 'irregular').slice(0, 3)) {
    add('recurring_found', `recurring_found:${r.fact.merchant}`, 'info', {
      merchant: r.fact.merchant, amount: r.fact.typical_amount.display, cadence: r.fact.cadence,
    }, r.fact.drilldown);
  }

  // Category movers: every category with previous spend of at least KSh 500 that moved by 25% or more,
  // including categories that dropped to zero. Largest absolute change first; at most two each way.
  const movers: { id: string; d: Delta; out: number }[] = [];
  for (const id of new Set([...ctx.curCats.keys(), ...ctx.prevCats.keys()])) {
    const before = ctx.prevCats.get(id)?.out ?? 0;
    const now = ctx.curCats.get(id)?.out ?? 0;
    if (before < KSH_500) continue;
    const d = delta(now, before);
    if (Math.abs(d.pct.value) >= 25 && d.cents !== 0) movers.push({ id, d, out: now });
  }
  movers.sort((a, b) => Math.abs(b.d.cents) - Math.abs(a.d.cents));
  for (const [kind, sign] of [['category_rising', 1], ['category_falling', -1]] as const) {
    for (const m of movers.filter((x) => Math.sign(x.d.cents) === sign).slice(0, 2)) {
      add(kind, `${kind}:${m.id}`, kind === 'category_rising' ? 'notable' : 'info', {
        ...catParams(m.id), out: formatMoney(m.out), delta: m.d.display, delta_pct: m.d.pct.display,
      }, catDrill(m.id));
    }
  }

  const record = ctx.input.previous_report_totals;
  if (record) {
    const metrics = [
      ['out', cur.out, record.out_cents],
      ['in', cur.in, record.in_cents],
      ['fees', cur.fees, record.fees_cents],
    ] as const;
    for (const [metric, value, before] of metrics) {
      if (before > 0 && value > before) {
        add('personal_record', `personal_record:${metric}`, 'notable', {
          metric, value: formatMoney(value), previous_record: formatMoney(before),
        }, drill({ ...range, direction: metric === 'in' ? 'in' : metric === 'out' ? 'out' : null }));
      }
    }
  }

  const late = ctx.input.late_arrival_count ?? 0;
  if (late > 0) add('late_arrivals', 'late_arrivals', 'info', { count: count(late).display }, drill({ ...range }));
  const unknown = ctx.input.unknown_message_count ?? 0;
  if (unknown > 0) add('unknown_messages', 'unknown_messages', 'info', { count: count(unknown).display }, drill({ ...range }));

  if (ctx.input.kind === 'monthly' && period.days_elapsed > 0 && period.days_elapsed < period.days && cur.out > 0) {
    add('month_projection', 'month_projection', 'info', {
      projected: formatMoney(divRound(mulSafe(cur.out, period.days), period.days_elapsed)),
      spent: totals.out.display,
      days_elapsed: count(period.days_elapsed).display,
      days: count(period.days).display,
    }, drill({ ...range, direction: 'out' }));
  }

  for (const a of ctx.accounts) {
    if (a.balance !== null && a.balance.cents < KSH_500) {
      add('balance_low', `balance_low:${a.account_ref}`, 'important', {
        account: a.label, balance: a.balance.display,
      }, drill({ ...range, account_ref: a.account_ref }));
    }
  }

  if (ctx.input.kind === 'weekly' && cur.fees === 0 && cur.out > 0) {
    add('no_fees_week', 'no_fees_week', 'info', { out: totals.out.display }, drill({ ...range, direction: 'out' }));
  }

  // Unique ids, then important > notable > info, stable within a severity.
  const seen = new Map<string, number>();
  const unique = list.map((i) => {
    const n = (seen.get(i.id) ?? 0) + 1;
    seen.set(i.id, n);
    return n === 1 ? i : { ...i, id: `${i.id}#${n}` };
  });
  return unique
    .map((insight, index) => ({ insight, index }))
    .sort((a, b) => SEVERITY_RANK[a.insight.severity] - SEVERITY_RANK[b.insight.severity] || a.index - b.index)
    .map((x) => x.insight);
}
