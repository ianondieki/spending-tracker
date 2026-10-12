/**
 * computeFacts: a pure, deterministic function from a transaction window to the FactsSheet. Same input, same
 * output; it never reads the clock (`generated_at` stands in for "now") and never formats a number itself
 * (money.ts does). Everything is integer cents summed with sumMinor.
 */
import type { FactsSheet } from '../contracts/facts-sheet.js';
import { count, delta, money } from '../money.js';
import { parseIsoDate, periodContaining, previousPeriod } from '../period.js';
import { buildAnomalies, findDuplicates, findUnusual } from './anomalies.js';
import {
  buildAccounts, buildCategories, categoryAggs, categoryNamer, isMerchantTx, merchantAggs, merchantFact, personAggs, personFact,
} from './breakdowns.js';
import { buildBudgets } from './budgets.js';
import { averageDailyOut, bucketOf, buildDaily, largest, spendiestDay, timeOfDay, txFact, weekdayWeekend } from './days.js';
import { collectDisplayStrings } from './display.js';
import { buildIncome } from './income.js';
import { buildInsights } from './insights.js';
import { overdraftFact, overdraftRaw } from './overdraft.js';
import { prepare, slice } from './prepare.js';
import { findRecurring } from './recurring.js';
import { isSpend, rawTotals, toTotals } from './totals.js';
import { trendMonths, ytdTxs } from './trend.js';
import type { FactsInput } from './types.js';

export const FACTS_VERSION = '1' as const;

export function computeFacts(input: FactsInput): FactsSheet {
  const { period, kind } = input;
  if (period.kind !== (kind === 'weekly' ? 'week' : 'month')) {
    throw new TypeError(`computeFacts: a ${kind} report needs a ${kind === 'weekly' ? 'week' : 'month'} period, got ${period.kind}`);
  }
  const startMs = Date.parse(period.start);
  const endMs = Date.parse(period.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new TypeError('computeFacts: invalid period bounds');
  }
  if (!Number.isFinite(Date.parse(input.generated_at))) throw new TypeError('computeFacts: invalid generated_at');

  const opts = { weekStart: input.user.week_start, now: input.generated_at } as const;
  const prevPeriod = previousPeriod(period, opts);
  const nextEndMs = Date.parse(periodContaining(period.kind, parseIsoDate(period.end), opts).end);
  const names = categoryNamer(input.categories);

  const window = prepare(input.transactions, endMs);
  const cur = slice(window, startMs, endMs);
  const prev = slice(window, Date.parse(prevPeriod.start), Date.parse(prevPeriod.end));
  const spend = cur.filter(isSpend);
  const prevSpend = prev.filter(isSpend);
  const windowSpend = window.filter(isSpend);

  const curRaw = rawTotals(cur);
  const prevRaw = rawTotals(prev);
  const totals = toTotals(curRaw);
  const previousTotals = toTotals(prevRaw);
  const deltas = {
    out: delta(curRaw.out, prevRaw.out),
    in: delta(curRaw.in, prevRaw.in),
    fees: delta(curRaw.fees, prevRaw.fees),
    net: delta(curRaw.net, prevRaw.net),
  };

  const curCats = categoryAggs(spend);
  const prevCats = categoryAggs(prevSpend);
  const categories = buildCategories(curCats, prevCats, curRaw.out, period, names);

  const priorMerchants = new Set(window.filter((t) => t.ms < startMs && isMerchantTx(t)).map((t) => t.key));
  const allMerchants = merchantAggs(spend);
  const newMerchants = allMerchants.filter((m) => !priorMerchants.has(m.key));
  const merchants = allMerchants.slice(0, 15).map((m) => merchantFact(m, !priorMerchants.has(m.key), period));

  const allPeople = personAggs(cur);
  const people = allPeople.slice(0, 10).map((p) => personFact(p, period));
  const accounts = buildAccounts(input.accounts, window, cur);

  const dailyRows = buildDaily(period, cur);
  const spendiest = spendiestDay(dailyRows);
  const ww = weekdayWeekend(spend, curRaw.out);
  const largestTxs = largest(spend);
  const recurring = findRecurring(windowSpend);
  const budgets = buildBudgets(input.budgets ?? [], kind, period, curCats);
  const od = overdraftRaw(period, cur);
  const income = buildIncome(cur.filter((t) => t.cls === 'income'));

  const duplicates = findDuplicates(spend);
  const unusual = findUnusual(windowSpend, startMs);
  const labels = new Map(accounts.map((a) => [a.account_ref, a.label]));
  const anomalies = buildAnomalies({
    period,
    periodTxs: cur,
    duplicates,
    unusual,
    previousFees: prevRaw.fees,
    previousDays: prevPeriod.days,
    accountLabel: (ref) => labels.get(ref) ?? ref,
  });

  const candidate_insights = buildInsights({
    input,
    period,
    nextEndMs,
    cur: curRaw,
    prev: prevRaw,
    totals,
    previousTotals,
    deltaOut: deltas.out,
    categories,
    curCats,
    prevCats,
    names,
    newMerchants,
    people: allPeople,
    largest: largestTxs,
    periodTxs: cur,
    spend,
    spendiest,
    weekendOut: ww.weekend_out.cents,
    weekdayOut: ww.weekday_out.cents,
    weekendShare: ww.weekend_share.value,
    nightSpend: spend.filter((t) => bucketOf(t.hour) === 'night'),
    budgets,
    recurring,
    overdraft: od,
    accounts,
    duplicates,
    unusual,
    income,
  });

  const sheet: Omit<FactsSheet, 'display_strings'> = {
    version: FACTS_VERSION,
    generated_at: input.generated_at,
    user: { locale: input.user.locale, week_start: input.user.week_start, display_name: input.user.display_name ?? null },
    period,
    previous_period: prevPeriod,
    totals,
    previous_totals: previousTotals,
    deltas,
    categories,
    merchants,
    people,
    accounts,
    daily: dailyRows.map((r) => r.fact),
    average_daily_out: money(averageDailyOut(curRaw.out, period.days)),
    spendiest_day: spendiest ? spendiest.fact : null,
    weekday_weekend: ww,
    time_of_day: timeOfDay(spend),
    largest: largestTxs.map(txFact),
    new_merchants: newMerchants.map((m) => m.name),
    recurring: recurring.map((r) => r.fact),
    budgets,
    overdraft: overdraftFact(od),
    income,
    trend_months: kind === 'monthly' ? trendMonths(period, window) : [],
    ytd: kind === 'monthly' ? toTotals(rawTotals(ytdTxs(period, window))) : null,
    anomalies,
    late_arrivals: count(input.late_arrival_count ?? 0),
    unknown_messages: count(input.unknown_message_count ?? 0),
    candidate_insights,
  };
  return { ...sheet, display_strings: collectDisplayStrings(sheet) };
}
