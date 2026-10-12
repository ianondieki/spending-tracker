# @hesabu/analytics

**Owner:** Lane B (backend and agents). **Purpose:** deterministic analytics over the ledger: the facts sheet, aggregates and drill-downs every report number comes from. Pure functions, integer minor units, no model calls.

## Calling it

```ts
import { computeFacts, resolvePeriod, FactsSheetSchema } from '@hesabu/analytics';

const period = resolvePeriod('weekly', 'last_week', { weekStart: 'monday', now: generatedAt });
const sheet = computeFacts({
  user: { locale: 'en', week_start: 'monday', display_name: null },
  kind: 'weekly',                 // must match period.kind ('week' | 'month'), or computeFacts throws
  period,                         // end is exclusive
  transactions,                   // the window, see below
  accounts,                       // Account rows from the sync payload
  categories,                     // { id, name_en, name_sw }[] for the taxonomy ids in use
  budgets,                        // optional { category_id, limit_cents, period: 'weekly' | 'monthly' }[]
  unknown_message_count,          // optional
  late_arrival_count,             // optional; rows that arrived after the previous report (the worker counts them)
  previous_report_totals,         // optional { out_cents, in_cents, fees_cents }: the record for personal_record
  generated_at: generatedAt,      // ISO date-time; also the clock for previous_period.days_elapsed
});
FactsSheetSchema.parse(sheet);    // always passes; the tests check it
```

`computeFacts` is pure and deterministic: the same input gives a deep-equal output, it never reads the clock, and the
output does not depend on the order of `transactions` (rows are sorted by `occurred_at`, then `id`).

**The window the caller must supply.** Every transaction from the earliest of (six months before `period.start`,
1 January of the period's year) up to `period.end`. The engine filters: rows at or after `period.end` are dropped;
the previous period, the six-month trend, year to date, recurring detection, "new merchant" and "unusual amount"
all read from the earlier part of the window. A shorter window gives correct period totals but weaker history facts.

**Fail closed.** `computeFacts` throws a `TypeError` when the period does not match `kind`, when `generated_at` or an
`occurred_at` does not parse, or when `amount_cents` / `fee_cents` is not a non-negative safe integer (or
`balance_after_cents` is not a safe integer). Validate rows with `TransactionSchema` at the API boundary.

## Classification

`BALANCE_QUERY` and `FAILED` rows are dropped before anything else, everywhere. Every other row falls into exactly one
class; the first rule that matches wins:

| Order | Rule | Class | Counted in |
|---|---|---|---|
| 1 | type `FEE` | fee | `fees` (its amount) |
| 2 | type `REVERSAL` | reversal | nothing but `fees` (its fee) and the `reversal` anomaly |
| 3 | type `FULIZA_DRAWDOWN`, `MSHWARI_LOAN` (any direction) | loan in | `overdraft` only; never income, never spending |
| 4 | type `MSHWARI_DEPOSIT`, direction out | savings | `savings_out` |
| 5 | type `FULIZA_REPAY`, `MSHWARI_LOAN_REPAY`, `LOAN_REPAY` | loan repayment | `loan_repayments` |
| 6 | `is_transfer`, or type `INTERNAL_TRANSFER`, `MPESA_TO_BANK`, `BANK_TO_MPESA`, `KCB_MPESA`, `MSHWARI_WITHDRAW` | transfer | `transfers` |
| 7 | direction out | spend | `out` (cash: `WITHDRAW`, `ATM` also in `cash_withdrawn`) |
| 8 | direction in | income | `in` |
| 9 | direction none | other | `transaction_count` and `fees` only |

- `fees` = `fee_cents` of every row + `amount_cents` of `FEE` rows. `net` = in − out − fees.
- `transfers` counts each move once: out legs, plus in (or none) legs without a `transfer_pair_id`.
- `transaction_count` = every non-ignored row. `fee_ratio` = fees / out; `savings_rate` = savings_out / in (0 with no income).
- Percentages are whole numbers rounded half up (`ratioPct`); money displays are whole shillings (`money.ts`).
- A `null` category is the system category `uncategorised` ("Uncategorised" / "Bila kundi") everywhere in the sheet.
  Unknown ids use the id as both names.

## Sections

- **previous_period / previous_totals / deltas**: `previousPeriod()` with the user's week start; `delta()` for out, in, fees, net.
- **categories**: every category with spending > 0, by out desc; share of `totals.out`; delta vs the same category in the
  previous period; `top_merchant` = merchant with the most spending in the category, else null.
- **merchants** (max 15): counterparty kind `merchant | paybill | till | agent | bank` with a name, grouped by normalised
  name (trimmed, whitespace collapsed, case-insensitive; displayed as first seen, trimmed). `category_id` = the
  merchant's biggest category. `is_new` = no merchant-kind row with that name before `period.start` in the window.
  `new_merchants` lists every new merchant (not only the top 15) in the same order.
- **people** (max 10): counterparty kind `person`; `sent` = spending, `received` = income. A person with no name is
  grouped and shown by `ref_masked`. Drill-down by `counterparty_ref` when known, else by name.
- **accounts**: supplied accounts in order, then any `account_ref` seen in the period. `in`/`out`/`fees` use the totals
  rules, so the rows add up to the totals. Balance = latest `balance_after_cents` in the window, else
  `Account.last_balance_cents`. `balance_series` = every period row with a balance, ascending.
- **daily**: every Nairobi date of the period; `count` is every non-ignored row that day (so the counts add up to
  `transaction_count`). `average_daily_out` = out ÷ `period.days`, half up. `spendiest_day` = max out (earliest on a tie), null when out is 0.
- **weekday_weekend**: Saturday and Sunday are the weekend whatever the week start.
- **time_of_day**: Nairobi hour; morning 05–11, afternoon 12–16, evening 17–20, night 21–04; always four buckets.
- **largest**: top five spending rows (earlier first on a tie). `counterparty` = name, else masked ref, else null.
- **recurring**: over the whole window, a merchant with ≥ 3 spending payments within ±20% of the median of all its
  payments (median > 0). On those payments: gaps in Nairobi calendar days; median gap 5–9 → weekly, 26–35 → monthly,
  else irregular; `confidence` = share of gaps in the band (0 for irregular), two decimals; `typical_amount` = their
  median; `next_expected` = last + 7 / + 30 days (+03:00) or null; `is_subscription` = every amount within ±2% of
  `typical_amount` and not irregular. Sorted by `next_expected`, nulls last. Irregular ones are listed.
- **budgets**: budgets whose period matches the report kind, in input order. projected = spent × days ÷ days_elapsed
  (spent when days_elapsed is 0); `over` when spent > limit, `watch` when projected > limit or used ≥ 80%, else `ok`.
- **overdraft**: Fuliza drawdowns, repayments, fees on both. Overdraft days: running (drawdowns − repayments) from the
  period start, floored at 0 after each event, > 0 at the end of a Nairobi day; only days up to `days_elapsed`
  count, so an in-progress period never counts the future. A balance carried in from before the period is not seen.
- **income**: income rows grouped by normalised name (masked ref when nameless, else "Unknown"); kind from the first
  row: person → `person`; name has refund/reversal → `refund`; salary/payroll/wages → `salary`; merchant, paybill,
  till or bank → `business`; else `other`.
- **trend_months** (monthly only): six calendar months ending with the report month, same rules; labels `Oct 2026` /
  `Okt 2026`. **ytd** (monthly only): 1 January to `period.end`. Weekly: `[]` and `null`.
- **anomalies** (params are display strings only):
  - `duplicate`: period spending rows with the same normalised counterparty name and amount, each within 60 minutes of
    the previous one; one anomaly per cluster with every id. Params: merchant, amount, count, date.
  - `unusual_amount`: a period payment > 3 × the median of ≥ 3 earlier payments to that merchant in the window.
  - `reversal`: each `REVERSAL` row. Params: amount, date, counterparty (when known).
  - `fee_spike`: a day whose fees > 3 × the previous period's average daily fees (previous fees > 0).
  - `balance_break`: consecutive rows on one account, both with balances, where previous balance − amount − fee (out),
    + amount (in) or − fee (none) misses the next balance by more than KSh 1.

## Candidate insights

Every kind that applies is emitted, ordered important → notable → info, stable within a severity; ids are stable and
unique (`top_category:<id>`, `new_merchant:<name>`, …). Params are non-empty display strings, names, ISO dates or
small enums, never numbers and never null (the i18n renderer fails closed on a missing value). Names follow
`packages/i18n/src/insight-params.ts`.

| kind | params | when | severity |
|---|---|---|---|
| spend_vs_last | out, previous_out, delta, delta_pct, direction | always | notable if \|pct\| ≥ 20 |
| top_category | category_id, category_en, category_sw, out, share | out > 0 | info |
| biggest_transaction | amount, counterparty, date, category_id | largest[0] with a known counterparty | info |
| new_merchant | merchant, out, count | top 3 new merchants by out | info |
| duplicate_payment | merchant, amount, count | each duplicate | important |
| unusual_amount | merchant, amount, typical | each unusual amount | notable |
| fees_total | fees, fee_ratio, count | fees > 0 (count = rows with a fee + FEE rows) | info |
| fee_ratio_change | fee_ratio, previous_fee_ratio, direction | both periods have spending; moved ≥ 2 points | notable up, info down |
| fuliza_usage | drawdown, repaid, cost, days | drawdown > 0 | important if cost ≥ KSh 200 |
| cash_withdrawn | amount, count | cash > 0 | info |
| savings_rate | rate, savings, income | in > 0 and savings > 0 | info |
| income_received | income, count, top_source | in > 0 | info |
| sent_to_people | total, count (people), top_person, top_amount | anyone was sent money | info |
| spendiest_day | weekday_en, weekday_sw, date, out | spendiest_day exists | info |
| weekend_share | share, weekend_out, weekday_out | out > 0 | notable if share ≥ 40 |
| late_night_spend | out, count | night bucket > 0 | info |
| budget_at_risk | category_id, category_en, category_sw, spent, limit, projected, used | status watch | notable |
| budget_over | category_id, category_en, category_sw, spent, limit, used | status over | important |
| subscription_due | merchant, amount, next_expected | subscription due in the next period | info |
| recurring_found | merchant, amount, cadence | non-subscription weekly/monthly, max 3 | info |
| category_rising / category_falling | category_id, category_en, category_sw, out, delta, delta_pct | previous ≥ KSh 500, \|pct\| ≥ 25 (falling includes drops to zero); max 2 each by size of change | notable / info |
| personal_record | metric, value, previous_record | value > a previous record that is > 0 | notable |
| late_arrivals / unknown_messages | count | > 0 | info |
| month_projection | projected, spent, days_elapsed, days | monthly, 0 < days_elapsed < days, out > 0 | info |
| balance_low | account, balance | known balance < KSh 500 | important |
| no_fees_week | out | weekly, fees 0, out > 0 | info |

## display_strings

Built last by walking the finished sheet: every `display` value (Money, Pct, Count, Delta), every `label_en`,
`label_sw`, `weekday_en`, `weekday_sw` (periods, days, trend months), and every string param of every insight and
anomaly; de-duplicated in first-seen order. The fact-checker allows a number in report copy only if it appears here.

## Fixtures for other packages

`sampleTransactions()`, `sampleAccounts()`, `sampleCategories()`, `sampleFactsInput(kind)`, `sampleFactsSheet(kind)`
and `makeTransaction(n, overrides)` are exported from the package root. The sample ledger (July to September 2026,
M-Pesa and an Equity bank card) is documented in `src/fixtures.ts`; the weekly sample is 21 to 27 September 2026 and
the monthly sample is September 2026. Every figure is worked out by hand in `src/facts.test.ts`.

## Conventions

- ESM + TypeScript strict (`tsconfig.base.json`), NodeNext resolution: relative imports end in `.js`.
- `src/index.ts` is the public surface. Other workspace packages import `@hesabu/analytics` only.
- Types resolve from `src/` (no build needed for `pnpm typecheck`); runtime imports resolve to `dist/`
  (`pnpm build` at the root builds in dependency order).
- Tests live in `src/**/*.test.ts` (Vitest, fast-check for properties). Sibling packages resolve to their source in
  tests via the alias in `vitest.shared.ts`, so tests never need a prior build.

## Scripts

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm clean`
