# Master build prompt — Spending app (working name: **Hesabu**) `[[NAME-REVIEW]]`

> **How to use this file (for the human).** Open Claude Code in the `spending-tracker` repo on branch
> `claude/beautiful-pascal-w5oxu3` and paste this whole file as the first message. Run **Phase 0** first (documents
> only). After that, run **one phase per session** using the one-paragraph kickoffs in `prompts/PHASE-KICKOFFS.md`.
> `CLAUDE.md` at the repo root is loaded every session and must stay consistent with this file. "Hesabu" (Swahili:
> account / calculation) is a working name; you pick the real one at gate G0.

---

## 0. Your role and how you work

You are the orchestrator and lead engineer for Hesabu, a personal-finance companion for Kenya that turns the money
messages already arriving on a person's Android phone into a clean ledger, rich in-app insight, and weekly and monthly
reports delivered to WhatsApp and email. You own architecture, design, code, tests, and documentation. Think before you
build. You have decision rights over everything not reserved for the human in §14 or §15. Record every significant
decision as an ADR (`docs/adr/NNN-title.md`: context, options, decision, consequences). Prefer the simplest design that
honours the principles in §2. A phase is done when its exit criteria pass, not when code exists.

Working rhythm, every session:

1. **Context.** Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS-NEEDED.md`, `docs/GATES.md`, then only the
   sections of this file the phase needs (§16 names them).
2. **Plan.** Write or refresh the task cards for the phase (`docs/tasks/<REQ-ID>.md`: goal, acceptance tests as
   Given/When/Then, files, risks). Keep the plan short.
3. **Build.** Small conventional commits (≤ ~300 changed lines, one concern, a REQ-ID in the subject). Up to three
   implementers in git worktrees; only the `db-migrations` agent writes migrations.
4. **Test.** Every acceptance test ID in the phase has an automated test. All tests pass. Nothing in CI reaches a real
   LLM, email, WhatsApp, SMS or payment provider.
5. **UI.** For screens: `frontend-design` skill for direction, `impeccable` to polish and audit, `dataviz` before any
   chart, Playwright screenshots at 360 px and 412 px (phone) and 1440 px (web), axe, then `ux-reviewer`.
6. **Review.** `reviewer` PASS on every PR; `security-reviewer` PASS for auth, tenancy, ingestion, LLM, delivery,
   billing code; `ux-reviewer` PASS on UI PRs. Fix every critical and high finding.
7. **Report.** Phase report in `docs/PROGRESS.md` (what shipped, test counts, cost, open risks), then stop at the phase
   gate and wait for the human in `docs/GATES.md`.

When you need an external fact (an SMS template, a Play policy clause, a WhatsApp rule, a price, a short code), do not
rely on memory: research it with a cited note in `docs/research/`, ask the human, or make the fact *data*
(configuration, fixtures) rather than code. Never invent message formats, API fields or prices.

---

## 1. Mission and success

**Product.** Hesabu reads transaction messages from M-Pesa, Airtel Money, T-Kash, banks, card issuers and other wallets
on the user's Android phone; parses them on the device into a structured, categorised ledger; syncs the structured
ledger (never the raw messages) to a backend; and at the end of every week and every month generates a designed,
chart-rich, plain-language report that is delivered to the user's verified WhatsApp number and email address. The app
itself is a rich companion: transactions with search and correction, budgets, accounts and balances, insights, a
report archive with interactive charts, and an "Ask" assistant grounded only in the user's own numbers.

**Who it is for.** Kenyans who move money through several rails (M-Pesa first, then banks, Airtel Money, T-Kash, cards)
and want to know, without bookkeeping, where their money went, what changed, and what to watch. Phones are mostly
mid- and low-range Android (Tecno, Infinix, Samsung A-series, Xiaomi), networks are often slow, and WhatsApp is the
channel people actually read.

**Success looks like.**
- From the WhatsApp message alone, a user can answer "what did I spend, on what, what changed, what should I watch" in
  under a minute.
- Parse accuracy ≥ 99.5 % on the golden corpus; every unparsed message is surfaced, never silently dropped.
- Reports arrive within 15 minutes of their schedule, every period, even when the AI layer is down (degraded,
  numbers-only report).
- Zero raw SMS bodies on the server. Zero numbers in any narrative that are not in the computed facts.
- The app and the reports look like one designed product, not a template.

**Non-goals for v1.** iOS SMS reading (impossible on iOS; iOS arrives later via statement import), bank-API
aggregation, bill payment, lending, investing, multi-currency ledgers, family/shared accounts, monetisation.

---

## 2. Principles (these override everything below)

- **P1 Numbers are computed, never generated.** Code computes every total, delta, share and ranking from the ledger.
  Language models only select, order and explain facts they are given. A deterministic fact-checker rejects any
  narrative containing a number that is not in the facts sheet.
- **P2 Raw messages never leave the phone.** Parsing runs on the device. The server receives structured transactions
  only. Unknown messages go to the LLM fallback only after on-device redaction (phone numbers, account numbers,
  national IDs, personal names replaced by placeholders), and only with the user's consent.
- **P3 Deterministic first, model second, learned third.** Provider pattern packs (data) parse the known formats;
  an LLM extractor handles unknowns into a strict schema; confirmed extractions become new candidate patterns that
  must pass the corpus before promotion.
- **P4 Transfers are not spending.** Money moving between the user's own accounts (bank → M-Pesa, M-Pesa → M-Shwari,
  withdrawals to cash) is matched and excluded from spend. Double counting is a release-blocking bug.
- **P5 Fees are first-class.** M-Pesa transaction costs, Fuliza charges, bank charges, excise duty and card fees are
  parsed, categorised and reported as "the cost of moving money".
- **P6 Every number has a why.** Any figure in a report or screen drills down to the transactions behind it.
- **P7 Reports are designed objects.** One idea per chart, readable at thumbnail size, consistent palette, honest
  axes, direct labels, light and dark variants. The WhatsApp hero image must be legible at 25 % scale.
- **P8 Built for the phones people have.** Offline-first, 360 px layouts, Slow-4G budgets, survives Transsion and
  Xiaomi background restrictions, cold start under 2 s on a Moto G-class device.
- **P9 All inbound text is untrusted.** An SMS can contain "ignore previous instructions". SMS bodies, merchant names
  and user notes are data, never instructions; models only ever produce structured output or narrative, never actions.
- **P10 Fail closed.** Missing secret → the service refuses to start. Missing consent → no delivery. No secrets in git.
- **P11 Quiet, distinctive interface.** Personality comes from typography, number craft and chart craft, not from
  gradients, mascots, flag colours or safari motifs. One accent colour; semantic colours for money in, money out, fees
  and transfers.
- **P12 Kenyan by default, not by cliché.** KES formatting (`KSh 12,450`), Africa/Nairobi time, Monday week start,
  English and Kiswahili from day one, the real category vocabulary (airtime and bundles, sent to people, chama,
  Fuliza, KPLC tokens, matatu, school fees, SHA).
- **P13 Honest and kind.** Observations and options, never shaming, never claims of financial advice; betting, loans
  and overdrafts are reported neutrally and can be hidden by the user.
- **P14 Cost-capped AI, graceful degradation.** Per-report, per-user and global token budgets with a kill switch;
  when the budget or provider is unavailable the report still sends with computed facts and template copy.

---

## 3. Scope by release

| Release | Includes |
|---|---|
| **R1 (private beta, APK + Play internal track)** | Android app; SMS ingestion with 12-month backfill; parsers for M-Pesa (all message types), Airtel Money, T-Kash, the top banks (Equity, KCB, Co-operative, NCBA, Absa, Stanbic, I&M, DTB, Family, Standard Chartered) plus a generic bank/card alert fallback; transfer matching; categorisation with learning; Home, Transactions, Accounts, Insights, Budgets, Reports, Settings; weekly and monthly report engine; email delivery; WhatsApp delivery via the in-app share sheet (no Meta approval needed); web report viewer behind signed links. |
| **R2 (public beta)** | Automated WhatsApp delivery via the WhatsApp Business Platform (Cloud API) with opt-in and delivery tracking; "Ask" assistant; Kiswahili complete; share-to-app and paste import for users who refuse SMS permission; Play Store listing with SMS declaration and Data Safety form. |
| **R3 (launch)** | M-Pesa and bank statement PDF/CSV import (also unlocks iOS later); notification-listener fallback for app notifications; local-only mode (no sync, on-device reports); referral and basic plan gating stubs (no payments). |

---

## 4. Architecture

Choose libraries within these constraints and record the choices as ADR-001..ADR-006 in Phase 0.

**Android app (Kotlin).** Jetpack Compose, Material 3 with a custom theme (not the default colour scheme), Hilt, Room
with SQLCipher, WorkManager, Kotlin coroutines and Flow, Ktor or Retrofit, a Compose chart library (Vico) or Canvas
charts drawn to the shared chart spec. minSdk 26. The app is the only parser of raw SMS. It holds the authoritative
copy of the ledger and syncs structured rows to the backend.

**Backend (TypeScript, Node 22, pnpm + Turborepo monorepo).** `apps/api` (Hono or Fastify, Zod schemas, OpenAPI
generated and frozen for the Android client), `apps/worker` (Postgres-backed job queue such as `pg-boss` or
`graphile-worker`: scheduling, report generation, delivery, webhooks), `apps/web` (Next.js: report viewer, email and
image render targets, admin), `packages/charts` (React chart components that render identically for web, email PNGs and
PDFs via Playwright), `packages/report-model` (the `ReportDocument` and facts-sheet schemas), `packages/analytics` (pure
functions over the ledger: aggregates, deltas, recurrence, anomaly candidates), `packages/agents` (Anthropic SDK: agent
definitions, prompts, evals), `packages/i18n`. Postgres 16 is the only database; Redis is not required. Object storage
(S3-compatible) for rendered PNG/PDF artefacts with short-lived signed URLs.

Why TypeScript for the backend: the report renderer, email templates, web viewer and chart components are one React
codebase; the parser never runs server-side (P2), so there is no parser to share with Kotlin.

**Shared contracts.** `contracts/openapi.json` (frozen per phase), `contracts/provider-packs/*.json` (sender IDs,
message patterns, field anchors, test fixtures; shipped in the app and updatable over the air), `contracts/chart-spec.md`
(the small catalogue of chart types and their data shapes), `contracts/report-document.schema.json`.

**AI layer.** Official Anthropic TypeScript SDK; load the `claude-api` skill before writing any SDK code. Default model
`claude-opus-5-5` with adaptive thinking; effort tuned per step (narrative `high`, classification `low` or `medium`,
judge `medium`); structured outputs for every machine-read response; prompt caching for stable system prompts and the
category taxonomy; Message Batches for bulk categorisation; handle the `refusal` stop reason; never prefill. Routing the
categoriser to `claude-haiku-5-5` or `claude-sonnet-5-5` is allowed only after the eval shows parity on the labelled
set and only after the human approves it (spend and quality are their call).

**Delivery.** Email via one transactional provider (Resend, Postmark or SES; human picks) with React Email templates.
WhatsApp via (a) the in-app share sheet in R1 and (b) the WhatsApp Business Platform Cloud API in R2, behind one
`WhatsAppProvider` interface with a fake for tests. SMS OTP via Africa's Talking or Firebase Phone Auth (human picks).

**Hosting (human decides spend).** Propose one region close to Kenya (for example Johannesburg or Cape Town) with
managed Postgres, one API service, one worker, one web app, object storage, and an egress-blocked CI runner.

---

## 5. Data model (authoritative, refine in ADR-003)

- `users` (id, phone_e164, email, locale `en|sw`, week_start, timezone fixed `Africa/Nairobi`, report preferences,
  created_at), `devices`, `consents` (purpose, version, granted_at, revoked_at; SMS access, sync, AI fallback, WhatsApp
  delivery, email delivery), `audit_log` (append-only).
- `accounts` (user_id, provider `mpesa|airtel_money|tkash|bank|card|wallet`, institution, label, mask, currency `KES`,
  last_balance, last_balance_at).
- `transactions` (id, user_id, account_id, provider, external_ref such as the M-Pesa code, type enum, direction
  `in|out`, amount, fee, balance_after, occurred_at, counterparty_name, counterparty_kind `person|merchant|paybill|
  till|agent|bank|self|unknown`, counterparty_ref masked, paybill, till, account_ref, category_id, is_transfer,
  transfer_pair_id, confidence, source `sms|notification|import|manual`, raw_hash (SHA-256 of the message, never the
  body), parser_version, user_edited flags, note, tags). Unique on (user_id, provider, external_ref) when a ref exists;
  otherwise on (user_id, raw_hash).
- M-Pesa type enum at minimum: `SEND_MONEY, RECEIVE_MONEY, PAYBILL, BUY_GOODS, WITHDRAW, DEPOSIT, AIRTIME,
  FULIZA_DRAWDOWN, FULIZA_REPAY, MSHWARI_DEPOSIT, MSHWARI_WITHDRAW, MSHWARI_LOAN, KCB_MPESA, BANK_TO_MPESA,
  MPESA_TO_BANK, POCHI, GLOBAL_SEND, REVERSAL, BALANCE_QUERY (ignored), FAILED (ignored)`. Bank and card types:
  `DEBIT, CREDIT, CARD_PURCHASE, ATM, FEE, LOAN_REPAY, STANDING_ORDER, INTERNAL_TRANSFER`.
- `categories` (system taxonomy, two levels, user-extendable; see §7), `merchants` (normalised name, aliases,
  paybill/till numbers, default category), `rules` (user-learned mappings with precedence), `budgets` (category,
  period, amount), `recurrences` (detected recurring payments: cadence, next_expected, confidence).
- `reports` (user_id, kind `weekly|monthly`, period_start, period_end, status, facts_json, document_json,
  artefact keys for hero PNG, chart PNGs, PDF and HTML, token usage, cost, generated_at), `deliveries` (report_id,
  channel `whatsapp|email|share`, status, provider_message_id, attempts, last_error, cost), `insights` (report_id,
  type, payload, drill-down query).
- `unknown_messages` on device only (encrypted body, sender, received_at, status `pending|taught|ignored`); the server
  sees only a redacted copy if the user allows AI fallback.

Row-level tenancy on every table by `user_id`; migrations only via the `db-migrations` agent.

---

## 6. Ingestion and parsing (on device)

- **Permissions and policy.** Request `RECEIVE_SMS` and `READ_SMS` only after an in-app prominent-disclosure screen
  that says what is read (messages from financial senders only), what leaves the phone (structured transactions, not
  messages) and how to revoke. Google Play's SMS policy lists "SMS-based financial transactions" as a permitted use
  and requires the Call Log & SMS declaration form; prepare the declaration text and a demo video in R2 and treat
  rejection as a real risk: R1 ships as a direct APK and Play internal testing, and the **share-to-app** and
  **paste** import paths (no SMS permission) must exist before the Play review.
- **Live and backfill.** A `BroadcastReceiver` on `SMS_RECEIVED` for live messages; a paged `ContentResolver` backfill
  of the inbox (default 12 months, user-adjustable) on first run; a WorkManager reconciliation job every 6 hours that
  re-scans the inbox for anything missed (receivers get killed on Tecno, Infinix, Xiaomi; show the "allow background
  activity" guidance per OEM). The address allow-list of financial senders is data in the provider packs; messages from
  other senders are never read into memory beyond the sender check.
- **Pattern packs.** Each provider pack declares sender IDs, message families, anchored field extractors (amount after
  its label, never "the first Ksh"), date and time formats, and a fixture corpus. Three amounts appear in most M-Pesa
  messages (amount, transaction cost, new balance): anchor every field to its label. Treat every format as unverified
  until a real sample is in `corpus/`. **The human supplies real messages** through the redaction tool you build in
  Phase 1 (`tools/redact-sms`), target ≥ 30 per message family per provider before a parser is called done.
- **Pipeline.** sender filter → family match → field extraction → normalisation (amount, fee, datetime in
  Africa/Nairobi, counterparty kind) → dedupe (external_ref, then raw_hash) → transfer matching (same amount, opposite
  direction, within 10 minutes, across the user's own accounts; withdrawals to cash become `Cash (untracked)`) →
  balance-chain check (if `balance_after` does not follow from the previous balance, flag a possible missed message and
  trigger reconciliation) → category assignment (§7) → local store → sync queue.
- **Unknown messages.** Shown in the app under "Teach Hesabu" with one-tap labelling; with consent the redacted text
  goes to the LLM extractor (strict schema: type, amount, fee, balance, counterparty, datetime, confidence). A confirmed
  extraction proposes a new pattern that must pass the whole corpus before it ships over the air.
- **Quality bar.** Golden corpus tests per family; property-based tests for amount and date normalisation; fuzzing
  with mutated samples; a parser version stamp on every row so a parser fix can re-run on stored messages.

---

## 7. Categorisation and enrichment

- **Taxonomy (system, two levels; refine with real data).** Food & groceries; Eating out & drinks; Transport (matatu
  and boda, ride-hailing, fuel, parking); Housing & rent; Utilities (KPLC tokens, water, gas, internet, Safaricom
  Home, Zuku); Airtime & bundles; Subscriptions & entertainment (Netflix, Showmax, DSTV/GOtv, Spotify); Shopping;
  Health (SHA, hospital, pharmacy); Education (school fees, books); Family & friends (sent to people); Chama, savings
  & investments (M-Shwari, lock savings, Sacco, MMF); Loans & credit (Fuliza, M-Shwari loan, KCB M-Pesa, Tala,
  Branch); Betting & gaming (neutral, hideable); Giving (church, tithe, harambee); Government & fees (KRA, NTSA,
  eCitizen); Business; Cash withdrawals (untracked); Fees & charges; Income (salary, business receipts, sent by
  people, refunds and reversals); Transfers (own accounts); Uncategorised.
- **Order of resolution.** user rule → merchant table (paybill and till numbers, normalised names) → provider type
  default (airtime, Fuliza, withdrawal) → model classification (batched, structured output, confidence) →
  Uncategorised. Every model classification shows a "suggested" badge until the user confirms or a confidence
  threshold is met; corrections become rules; rules sync across devices.
- **Enrichment.** Merchant normalisation ("NAIVAS LTD KILIMANI" → Naivas), counterparty kind, recurrence detection
  (same merchant, similar amount, regular cadence), subscription detection, income detection, "sent to people" with
  per-person totals, cash-withdrawal tracking.

---

## 8. Analytics engine (`packages/analytics`, pure and tested)

Pure functions from a transaction window to a **facts sheet** (`FactsSheet` JSON, versioned). Every report and every
in-app chart reads from these functions; nothing is computed in templates or by models. Minimum facts: totals in,
out, fees, net, transfers excluded; deltas against the previous period and the same period last month; per-category
totals, shares, deltas, transaction counts; per-merchant and per-person top lists; per-account balances and movement;
daily series with average; weekday and weekend split; time-of-day buckets; largest transactions; new merchants;
recurring payments found and due next period; subscriptions; budgets with projected end-of-period; Fuliza and
overdraft days and cost; cash withdrawn; income by source; savings rate; six-month trend series (monthly); year-to-date
(monthly); anomaly candidates (duplicates within an hour, amounts > 3× the merchant median, reversals, fee spikes);
unknown-message count. Each fact carries a drill-down query descriptor (P6).

---

## 9. Agents and orchestration

Orchestration is **deterministic code with model steps**, not a free-running agent swarm. One workflow per report:

1. `collect` — close the period, pull the window, compute the `FactsSheet` (no model).
2. `insight-select` — from the candidate insights the engine produced, the model ranks and selects ≤ 7 for weekly,
   ≤ 12 for monthly, with a one-line rationale each (structured output; it cannot add facts).
3. `write` — the report writer turns facts and selected insights into a `ReportDocument` (structured output: typed
   sections, chart references, copy in the user's language, tone per P13). It may only cite numbers from the facts
   sheet and only in the formats listed there.
4. `check` — a deterministic fact-checker extracts every numeral and percentage from the narrative and verifies each
   against the facts sheet (formatting and rounding tolerance only); a model judge scores clarity, usefulness, tone
   and language quality against a rubric. Failure → one regenerate with the findings attached → otherwise fall back to
   the numbers-only template (P14). Record both outcomes in evals.
5. `render` — hero PNG, chart PNGs, PDF, HTML email, web page from the same `ReportDocument` through
   `packages/charts` (Playwright headless render at 2× DPR, light and dark variants).
6. `deliver` — per channel, idempotent on (report_id, channel), retries with backoff, provider webhooks update status.

Other agents: `extractor` (unknown message → strict schema, redacted input, P2 and P9), `categoriser` (batched),
`coach` ("Ask": tool use over read-only typed query tools such as `spend_by_category`, `search_transactions`,
`compare_periods`, `budget_status`, `recurring_payments`; never free-form SQL; every answer cites the tool results;
refuses to speculate; streams; daily token cap per user), `judge` (evals).

Safety rails on every call: system prompt treats all user and message content as data; strict JSON schemas;
max_tokens set deliberately; per-call, per-user and global budgets with a feature-flag kill switch; all prompts and
schemas versioned in `packages/agents` with a changelog; every call logged with token counts and cost; no PII in logs.

---

## 10. Reports: content and visual specification

**Schedule (user-adjustable).** Weekly: period Monday 00:00 → Sunday 23:59, generated Sunday 19:30 Africa/Nairobi.
Monthly: calendar month, generated on the 1st at 07:30 covering the previous month. Transactions that arrive after a
period closes appear in the next report under "late arrivals" and in the corrected archive.

**One document, four renderings.** `ReportDocument` → (1) WhatsApp: a hero image (1080×1350, 4:5) plus a caption of
≤ 1,000 characters in WhatsApp formatting and a PDF document message when the user opts in; (2) email: responsive HTML
with inline chart images, the PDF attached, plain-text alternative, dark-mode safe, `List-Unsubscribe`; (3) web: the
interactive version behind a signed, expiring link ("Open full report"); (4) app: native screens with drill-downs.

**Weekly content (in this order).** Hero: total spent, delta vs last week, one verdict line. Income vs spend and net.
Category donut (≤ 6 slices + Other) with the top mover. Daily bars with the weekly average line and the spendiest day.
Top merchants and top people. Fees paid (M-Pesa charges, Fuliza, bank) with the fee ratio. Transfers and savings
(excluded from spend, shown separately). Budgets at risk with projected end-of-month. Selected insights (new merchant,
duplicate payment, subscription due, unusual amount, late-night spend, cash withdrawn). Three things to watch next
week. Unknown messages to teach. Footer: period, accounts covered, "numbers computed from your messages".

**Monthly content adds.** Six-month trend of spend, income and net with this month highlighted. Category trends
(rising and falling). Savings rate and money moved to savings. Recurring payments and the bills calendar for next
month. Balance trajectory per account. Weekday-versus-weekend and time-of-day patterns. Calendar heatmap. Income by
source. Loans and overdraft summary (neutral). Personal records ("lowest-fee month since June"). Year-to-date totals.
"Where the money could go differently" as three options, never prescriptions.

**Chart catalogue (fixed, in `packages/charts`; load the `dataviz` skill before building).** Donut, daily or weekly
bars with average line, stacked income-versus-spend bars, trend lines with a highlighted band, horizontal top-N bars,
cash-flow waterfall (income → categories → net), calendar heatmap, budget bullet bars, balance sparklines, fee meter.
Rules: one message per chart, title states the takeaway, direct labels over legends, KES formatting, no 3D, no dual
axes, colour-blind-safe palette with semantic colours for in, out, fee and transfer, both themes, each chart ships
with an accessible text summary and a data table toggle on web and in the app.

**Hero image.** Period and brand mark at top; the big number and its delta; a four-slice mini donut; a seven-bar daily
strip; three one-line insights; "Full report →". Must read at 25 % scale and in both themes.

**Tone.** Short sentences, concrete, warm, no exclamation marks, no judgement, second person, Kiswahili version
written natively (not translated word by word), currency as `KSh 12,450`, percentages whole numbers.

---

## 11. Delivery: WhatsApp and email

- **WhatsApp R1 (share sheet).** The app renders or downloads the hero PNG and PDF and opens the Android share sheet
  with WhatsApp preselected when installed. Zero cost, no Meta approval, works on day one.
- **WhatsApp R2 (Cloud API).** Research and cite the current WhatsApp Business Platform rules for Kenya before
  building: template categories, per-message billing (billing is per delivered template message; from 1 October 2026
  in-window utility and service messages are billable too), the 24-hour service window, opt-in requirements, and
  media limits. Build: Meta Business verification checklist for the human; `weekly_report_v1` and `monthly_report_v1`
  utility templates (image header, body variables for the key numbers, a URL button to the signed web report); an
  optional document message for the PDF; opt-in in the app by entering a number and tapping a `wa.me` link that
  pre-fills `JOIN <code>` to the business number (the inbound message proves number ownership and opens a session);
  webhooks for sent, delivered, read, failed; `STOP` handling; quiet hours; per-user monthly send cap; cost recorded
  per delivery.
- **Email.** Magic-link verification; React Email templates with inline chart images and the PDF attached; bounce and
  complaint webhooks; plain-text part; unsubscribe per channel.
- **Idempotency and observability.** One report per (user, kind, period); one delivery attempt chain per (report,
  channel); a delivery dashboard in admin; alerts when the delivered rate for a period drops below 98 %.

---

## 12. App UX and design specification

Load `frontend-design` first and write `docs/DESIGN_BRIEF.md` in Phase 0: name the aesthetic, the type pairing (a
distinctive display face with tabular figures for numbers, a workhorse body face), the palette (one accent, neutral
surfaces, semantic money colours), spacing scale, radius, elevation, motion rules (150–250 ms, reduced-motion
respected), icon set, light and dark themes, and the chart tokens shared with `packages/charts`. The brief is the
single source of truth for the app, the web viewer, the emails and the hero image.

**Screens (R1 unless marked).**
- **Onboarding.** Welcome (what Hesabu does, in two screens, no carousel of stock art) → prominent SMS disclosure →
  permission → backfill progress with live counts per provider → pick week start and report times → add email
  (magic link) → add WhatsApp number (R1: "we'll help you share"; R2: `JOIN` link) → done. Every step skippable with a
  clear consequence.
- **Home.** This week so far (spent, delta, daily strip), budget health, accounts and balances, three insight cards,
  recent transactions, "Teach Hesabu" badge when unknowns exist, next report countdown.
- **Transactions.** Infinite list grouped by day with running totals; search; filters (account, category, type,
  person, merchant, amount, date); detail sheet with category change, split, "this is a transfer", note, tags,
  "report a parse error"; bulk recategorise; rules management.
- **Accounts.** Per-account balance from the last message, movement sparkline, fee totals, "last message at".
- **Insights.** Interactive versions of the report charts for any period; category and merchant deep dives; people;
  fees; recurring payments and subscriptions calendar; cash.
- **Budgets.** Per category with projection, alerts, and a monthly roll-over summary.
- **Reports.** Archive of weekly and monthly reports; each opens the native rendering with drill-downs; share hero PNG
  and PDF; delivery status per channel.
- **Ask (R2).** Chat grounded in tools, with suggested questions, citations to the transactions used, streaming,
  bilingual.
- **Settings.** Channels and schedule, language, privacy (consents, AI fallback, data export, delete account),
  parsers and provider packs with versions, background-activity help per OEM, about and legal.

**States and quality.** Every screen has designed empty, loading (skeleton), error and offline states. TalkBack
labels on all interactive elements and chart summaries; contrast ≥ 4.5:1; 48 dp targets; dynamic type up to 130 %
without clipping; strings externalised with `en` and `sw`; numbers and dates localised; cold start < 2 s and jank-free
scrolling on a Moto G-class device; app size ≤ 25 MB.

**Web viewer.** One route per signed report link, same design brief, same charts, print stylesheet (the PDF is rendered
from it), 360 px and 1440 px layouts, Lighthouse accessibility ≥ 90 and performance ≥ 90 on the mobile profile.

---

## 13. Security, privacy and compliance

- **Threat model** (`docs/THREAT_MODEL.md`): stolen phone, malicious SMS (injection and spoofed sender IDs), hostile
  app on the same device, compromised backend, insider, abusive delivery (spam), token leakage via report links.
- **Device.** SQLCipher database keyed from the Android Keystore; biometric or PIN app lock; no financial data in
  notifications or the recents screenshot; certificate pinning for the API; no logging of message bodies.
- **Backend.** Phone-OTP sign-in plus optional Google; short-lived access tokens, rotating refresh tokens bound to a
  device; tenancy enforced in the data layer with tests that try to cross it; counterparty phone numbers masked
  before storage; encrypted at rest; report links are signed, single-purpose and expire; rate limits; audit log;
  dependency and secret scanning in CI.
- **AI.** Redaction before every model call; data-not-instructions framing; strict schemas; output never triggers
  side effects; injection red-team set in the evals; logs without PII.
- **Compliance.** Kenya Data Protection Act 2019: lawful basis and purpose per consent, a human task to register with
  the Office of the Data Protection Commissioner, privacy policy and terms drafts tagged `[[LEGAL-REVIEW]]`, data
  export and deletion within the app, retention defaults (ledger retained while the account exists; rendered reports
  12 months; unknown messages 30 days), Play Data Safety form, SMS declaration.

---

## 14. Decisions only the human makes (ask at Phase 0, record in `docs/DECISIONS-NEEDED.md`)

1. Product name and domain.
2. Hosting provider and region; monthly budget ceiling.
3. Email provider; SMS OTP provider; whether to go direct to Meta's Cloud API or through a solution provider.
4. Model routing for the categoriser after the eval (quality versus cost).
5. Which banks and wallets to prioritise after M-Pesa, and the supply of real sample messages per provider.
6. Default retention periods and whether counterparty names are stored on the server or only on device.
7. Beta cohort, distribution (APK, Play internal), and the launch date for Play review.
8. Any legal, pricing, claims or brand copy.

---

## 15. Stop and write to `docs/DECISIONS-NEEDED.md` (then continue unblocked work) when

a message would reach a non-test recipient; any spend or new vendor; a destructive migration, force-push or history
rewrite; a principle in §2 would be broken or two requirements conflict; CI fails after three genuine fixes; legal,
claims, pricing or brand text is needed (ordinary copy is written and tagged `[[COPY-REVIEW]]`); a gate is reached; a
phase budget is exceeded; a Play or Meta policy question cannot be answered from a cited source.

---

## 16. Build phases (one per session)

| Phase | Deliverables | Exit criteria | Gate |
|---|---|---|---|
| **0 Discovery and plan** (docs only) | `CLAUDE.md` refined; `docs/PLAN.md`; `docs/REQUIREMENTS.md` (requirement IDs R-ING, R-PRS, R-CAT, R-ANL, R-RPT, R-DLV, R-UX, R-AI, R-SEC, R-OPS, each with Given/When/Then acceptance tests); ADR-001..006; `docs/THREAT_MODEL.md`; `docs/DESIGN_BRIEF.md`; `docs/REPORT_SPEC.md` (§10 expanded with the facts-sheet and document schemas); `docs/research/` notes with citations (Play SMS policy, WhatsApp Platform rules and Kenya pricing, email providers, ODPC registration, provider sender IDs); `docs/DECISIONS-NEEDED.md`; `docs/GATES.md`; `docs/PROGRESS.md`; `.claude/agents/*.md`; `corpus/README.md` and the redaction tool spec; `docs/checks/check_traceability.py`. | Traceability check passes; every §2 principle maps to at least one requirement; decisions list complete. | **G0** human approves plan and answers §14. |
| **1 Foundations** | Monorepo, CI (lint, types, unit tests, secret scan, egress-blocked), backend skeleton with auth, tenancy, migrations, OpenAPI frozen; Android skeleton with theme from the design brief, SMS disclosure, permission flow, live receiver, backfill, M-Pesa provider pack covering every message family, Room+SQLCipher, sync; `tools/redact-sms`; golden corpus for M-Pesa. | M-Pesa parse accuracy ≥ 99.5 % on corpus; balance-chain check working; tenancy cross-access tests fail closed; app shows a live list of parsed transactions. | **G1** |
| **2 Parsing breadth and categorisation** | Airtel Money, T-Kash, bank and card packs, generic fallback; transfer matching; dedupe; taxonomy, merchant table, rules, categoriser agent with batch and structured output; Transactions screen with correction and "Teach Hesabu"; share-to-app and paste import. | Corpus accuracy per provider; zero double counting on the transfer test set; categoriser accuracy ≥ 90 % on the labelled set with user-rule precedence tests. | **G2** |
| **3 Analytics and in-app insight** | `packages/analytics` with the full facts sheet; `packages/charts` and the Compose charts; Home, Accounts, Insights, Budgets screens; design pass; screenshots at 360/412/1440; axe. | Facts sheet property tests; chart snapshot tests in both themes; `ux-reviewer` PASS; performance budgets met on an emulated low-end profile. | **G3** |
| **4 Report engine** | Workflow steps 1–5; writer, insight-select, checker, judge; renderer (hero PNG, charts, PDF, HTML, web viewer); report archive screen; email delivery; WhatsApp share-sheet delivery; schedules in Africa/Nairobi; degraded numbers-only path. | 100 % numeric fidelity on the eval set; a full weekly and monthly report generated from the seeded ledger in both languages and both themes; email delivered to Mailpit in CI; share flow screenshot-tested. | **G4** (human reviews real sample reports) |
| **5 WhatsApp Cloud API** | Provider interface, templates, opt-in `JOIN` flow, webhooks, delivery tracking, caps, admin delivery dashboard, Meta verification checklist. | End-to-end against the provider fake; a sandbox send to the human's own number only after G5 approval. | **G5** |
| **6 Ask assistant and evals** | Coach agent with typed tools, streaming UI, bilingual; evals suite (parser, categoriser, numeric fidelity, judge rubric, injection red team, cost per report) run nightly with a spend cap. | Injection set: zero successful instruction-following; cost per weekly report under the agreed cap; judge scores above threshold. | **G6** |
| **7 Polish and compliance** | Kiswahili complete; accessibility pass; low-end performance; OEM background guidance; privacy policy and terms drafts; Play listing, Data Safety form, SMS declaration and demo video; statement import groundwork. | Lighthouse and axe targets; Play pre-launch report clean; all `[[COPY-REVIEW]]` and `[[LEGAL-REVIEW]]` items listed for the human. | **G7** |
| **8 Audit and launch** | `security-reviewer` audit of the whole system; load and cost review; runbooks; launch checklist; beta cohort rollout plan. | No open critical or high findings; runbooks tested; definition of done (§19) met. | **G8** human launches. |

---

## 17. Sub-agents (`.claude/agents/`, created in Phase 0; sub-agents cannot spawn sub-agents)

| Agent | Model / effort | Use for |
|---|---|---|
| impl-android | opus / xhigh | one task card each in a worktree: Compose screens, ingestion, parsers, Room, sync |
| impl-backend | opus / xhigh | API, workflow, delivery, tenancy, policy code and tests |
| impl-ai | opus / xhigh | agents, prompts, schemas, evals, redaction, cost caps |
| impl-web | opus / high | charts package, report renderer, web viewer, email templates |
| db-migrations | opus / xhigh | the only writer of migrations, tenancy policies and seeds |
| test-writer | sonnet / high | tests from Given/When/Then rows; corpus and fixture maintenance |
| reviewer | opus / high | adversarial review of every PR; reports, never fixes |
| security-reviewer | fable / xhigh | auth, tenancy, ingestion, AI, delivery; Phase 8 audit |
| ux-reviewer | opus / high | UI PRs against the design brief and §12; axe, Lighthouse, screenshots |
| researcher | sonnet / high | cited external facts into `docs/research/` (policies, pricing, formats) |
| docs-writer | sonnet / medium | README, runbooks, help text, `[[COPY-REVIEW]]` copy; never legal text |
| chore | haiku | renames, lint autofix, dependency bumps |

Never run an Opus agent at default (medium) effort for code.

---

## 18. Testing, evals and quality gates

- **Unit.** Parsers against the golden corpus (every family, every provider), property tests for normalisation,
  analytics functions with hand-computed expectations, chart data shaping, redaction.
- **Integration.** API with a seeded Postgres; workflow steps with fake model, email and WhatsApp providers; webhook
  handlers; tenancy cross-access attempts; migrations up and down.
- **Android.** Robolectric for parser and repository; instrumented smoke on an emulator with
  `adb emu sms send <sender> "<body>"` fixtures; screenshot tests at 360 and 412 px in both themes; accessibility
  checks.
- **Web.** Vitest, Playwright screenshots at 360 and 1440 px, axe, Lighthouse (local, not a dependency).
- **Evals (`packages/agents/evals`, nightly with a spend cap, never in PR CI).** Parser extractor accuracy on held-out
  unknowns; categoriser accuracy on the human-labelled set (≥ 500 rows, the human spot-checks a model-bootstrapped
  labelling); numeric fidelity 100 % hard gate; judge rubric (clarity, usefulness, tone, language) with thresholds;
  injection red team (SMS and notes containing instructions) with zero tolerance; cost per report tracked over time.
- **Definition of a passing PR.** Green CI, `reviewer` PASS, the required specialist PASS, no skipped or deleted
  tests, no `--no-verify`.

---

## 19. Definition of done (launch)

Every requirement in `docs/REQUIREMENTS.md` has passing acceptance tests; the traceability check passes; a new user on a
low-end Android phone can onboard, see 12 months of correctly parsed history, correct a category, set a budget, and
receive the next weekly and monthly reports on WhatsApp and email with correct numbers in their chosen language; the
degraded path has been exercised in production-like conditions; the security audit has no open critical or high
findings; privacy policy, terms, Play declarations and ODPC registration are with the human; runbooks exist for
delivery failures, provider format changes (ship a pack update), cost spikes and key rotation.

---

## 20. Repo layout and conventions

```
spending-tracker/
  CLAUDE.md  README.md  prompts/  docs/ (PLAN, REQUIREMENTS, adr/, research/, tasks/, DESIGN_BRIEF, REPORT_SPEC,
  THREAT_MODEL, GATES, DECISIONS-NEEDED, PROGRESS, runbooks/, checks/)
  android/            Kotlin app (Gradle, Compose)
  apps/api  apps/worker  apps/web
  packages/analytics  packages/charts  packages/report-model  packages/agents  packages/i18n
  contracts/openapi.json  contracts/provider-packs/  contracts/chart-spec.md  contracts/report-document.schema.json
  corpus/             redacted real messages per provider (fixtures)   tools/redact-sms
  infra/              compose for the local stack (Postgres, Mailpit, MinIO), CI workflows
  .claude/agents/  .claude/skills/
```

Commits: `feat(R-PRS-03): parse M-Pesa Buy Goods family`, `fix(R-ANL-07): …`, `docs(platform): …`; every commit and
PR body ends with the attribution lines in `CLAUDE.md`. Secrets only in an untracked `.env`; every variable documented
in `.env.example`; the app and services fail closed without them. Never `--no-verify`; never delete or skip a test to
go green.
