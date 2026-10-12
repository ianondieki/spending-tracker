# Lane B report: backend, analytics, agents, delivery

Branch `claude/beautiful-pascal-w5oxu3-lane-b`. Every kickoff item (1–7) shipped, then the orchestrator's package 2
(real end-to-end with Lane C's renderer and Lane D's pack engine, sample artefacts, runbook, CI coverage, live-delivery
script). CI green on the lane branch. Total: **323 tests** across six packages, all run in CI against the Postgres
service, none reaching a real model, email, WhatsApp or S3.

## Package 2 (check-in 1 integration)

- `seed:demo` and the worker's end-to-end test now parse `corpus/demo/demo-inbox.jsonl` with `@hesabu/pack-engine`
  (parity with `demo-inbox.expected.json`: 82 messages, 81 transactions, 3 transfer pairs, 0 balance breaks) and
  categorise with `@hesabu/taxonomy` merchant seeds plus two persona rules (rent pay bill, bank ledger fee) that the
  verified merchant table must not carry. The collect step merges the system taxonomy names with the user's own.
- The worker renders through the real `@hesabu/renderer` (Playwright) in the user's theme; a test renders light and
  dark end to end and checks the hero, PDF and chart artefacts are real.
- **Bug found and fixed:** engine transaction ids are deterministic per message, so two users with the same message
  collided on the global primary key (the samples user silently lost every row to the test user and produced KSh 0
  reports). Migration `0003` makes the key `(user_id, id)`. A `deleteAllTransactions` tenant method supports reseeding
  (`RESEED=1 make seed-demo`).
- `docs/sprint/samples/<weekly|monthly>-<en|sw>-<light|dark>/`: hero.png (1080×1350), charts/*.png (1×), report.pdf,
  email.html, email.txt, document.json, facts.json, produced by `pnpm --filter @hesabu/worker samples` through the
  worker workflow (6 MB in total).
- `docs/sprint/DEMO-RUNBOOK.md`: clean clone → stack → seed → generate → web report → real email and WhatsApp once
  secrets exist → live model.
- `make check` / CI run the end-to-end demo path (`apps/worker/src/workflow.test.ts`) against the Postgres service;
  the Postgres suites skip with a warning when `DATABASE_URL` is unset, and the real-renderer test skips without
  Chromium. `make check-backend` exit 0 locally with every package.
- `apps/worker/scripts/live-delivery.ts` (`pnpm --filter @hesabu/worker live-delivery`): refuses unless
  `DATABASE_URL`, `RESEND_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `REPORT_TO_EMAIL`,
  `REPORT_TO_WHATSAPP` are all set; sends the latest finished weekly report to the owner only; `DRY_RUN=1` prints and
  exits. Not run here (no secrets).
- No edits were needed in other lanes' packages.

| Package | What shipped | Tests |
|---|---|---|
| `packages/db` | 15 tables (users, devices, consents, accounts, transactions, categories, merchants, rules, budgets, recurrences, reports, deliveries, insights, audit_log, report_links, plus ai_usage), every row carrying `user_id`; plain-SQL migrations with a runner; `TenantDb` (constructed with a user id, injects it into every statement and sets `app.user_id` for the RLS policies) and `SystemDb` for the few cross-tenant operations; HMAC device and report-link tokens (fail closed); pg-boss job names; `DbCostLedger`; the demo inbox loader (pack engine + taxonomy) and the inline sample ledger | 16 |
| `apps/api` | Hono: every path in `contracts/openapi.yaml`; device registration with HMAC tokens; idempotent sync (id + `updated_at`, dedupe on provider + ref + family); preferences; reports list/get/generate/deliver via a pg-boss queue; consent-gated unknown-message extraction; signed public link resolver and `/r/<token>` redirect; WhatsApp (handshake, statuses, JOIN/STOP, Meta signature) and Resend (Svix signature) webhooks; health with a DB ping; ajv cross-check of the Zod mirrors against the JSON schemas | 23 |
| `packages/analytics` | Zod mirrors of Transaction/Account/SyncRequest/FactsSheet; KSh display formatting (the fact-checker vocabulary); Nairobi periods and schedule arithmetic; `computeFacts` producing the whole sheet (totals, deltas, categories, merchants, people, accounts, daily, time of day, largest, recurring, budgets, overdraft, income, 6-month trend, YTD, anomalies, every applicable candidate insight, `display_strings`); sample ledger fixtures; property tests | 68 |
| `packages/i18n` | en and sw catalogues for all report chrome and chart titles/alt text; headline and body templates for all 28 insight kinds; `renderInsight`/`renderTemplate` that throw on an unknown placeholder | 99 |
| `packages/agents` | `ModelClient` (real Anthropic SDK client with structured output, refusal and max_tokens handling, prompt caching; a scripted fake); `insightSelect`, `writeReport`, `judgeReport`, `extractUnknownMessages`; deterministic `factCheck`; `writeFallback` (full ReportDocument from templates, en and sw); `produceReport` pipeline (select → write → check → one regenerate → fallback); pricing and cost ledger; `BudgetGuard` with daily USD cap and kill switch; `redact`; versioned prompts with a changelog; `try:model` manual script | 95 |
| `apps/worker` | pg-boss worker: workflow collect → insight-select → write → check → render → deliver, idempotent per report and per (report, channel); Nairobi scheduler (slot → period rule, 36 h look-back); S3/MinIO storage with fs and memory fakes; signed expiring links; Resend adapter (inline `cid:` images, PDF attached) and WhatsApp Cloud API adapter (upload media, image + caption, document, template stub) with fakes; renderer boundary (`PackageRenderer` over `@hesabu/renderer`, `StubRenderer` for tests); end-to-end demo test with the real renderer in both themes | 23 |

Also: Dockerfiles for api and worker, an `app` profile in `infra/docker-compose.yml`, `make dev` now applies
migrations, `make dev-app`, `make migrate`, `make seed-demo`, READMEs with curl examples (`apps/api/README.md`,
`apps/worker/README.md`, `packages/analytics/README.md`, `packages/agents/README.md`, `packages/i18n/README.md`),
and the new environment variables appended to `.env.example`.

## How to run it

```sh
cp .env.example .env     # set DEVICE_TOKEN_SECRET and REPORT_LINK_SECRET (openssl rand -hex 32)
make dev                 # Postgres, Mailpit, MinIO + migrations
pnpm dev:api             # :8787
pnpm dev:worker          # workflow, scheduler (every 5 min), deliveries
make seed-demo           # demo user + ledger, then generates last_week and last_month with delivery and waits
```

With no provider secrets the worker uses the fakes (storage on disk under `.hesabu-storage`, email and WhatsApp
recorded, numbers-only writer). With `AI_ENABLED=true` and `ANTHROPIC_API_KEY`, the model writes the report under
the daily cap; `pnpm --filter @hesabu/agents build && pnpm --filter @hesabu/agents try:model` exercises the real model
on a sample sheet and prints usage and cost.

Tests: `make check-backend` (or per package `pnpm --filter @hesabu/<pkg> test`). The Postgres suites read
`DATABASE_URL` (default `postgres://hesabu:hesabu@localhost:5432/hesabu`); without a reachable database they are
skipped locally and fail in CI.

## Design decisions worth knowing

- **Tenancy.** The only way to touch user data is `db.forUser(id)`; no method takes a user id. RLS policies are a
  second line (superusers bypass them, so the tests prove the helper, not the policy).
- **Spending semantics** are documented in `packages/analytics/README.md`: transfers, savings (M-Shwari deposits),
  loan repayments and fee-only rows are never `out`; fees are first-class; loans and reversals are never `in`;
  `net = in − out − fees`.
- **Schedule → period.** A slot within 12 hours of its period's end reports that period (Sunday 19:30 reports the
  week ending that night); otherwise the previous period. `next_report_at` in sync responses uses the same code.
- **Report links** carry a per-link nonce so a forced regeneration gets a fresh token; hashes are stored for
  revocation.
- **Fact-checker** allows only tokens present in `display_strings`, plus dates, years, times and capitalised month
  names; the fallback writer passes by construction (asserted in tests against the real engine output).
- **Fail closed everywhere:** missing `DEVICE_TOKEN_SECRET` → 503; missing `REPORT_LINK_SECRET` → 404; partial S3
  config → the worker refuses to start; production with no email/WhatsApp provider → deliveries `skipped`, never a
  fake send; malformed `AI_DAILY_BUDGET_USD` → no spend.

## Known gaps

1. **Demo inbox and renderer:** closed in package 2 (see above). The inline ledger remains only as a fallback when
   the corpus file is absent.
2. **Scripts need built packages.** `seed:demo`, `samples` and `live-delivery` run with tsx and resolve workspace
   packages through `dist/`, so `pnpm -r build` comes first (the runbook says so).
3. **Real model untested.** No key in this environment; the SDK path (structured output via `beta.messages.parse`,
   `fallbacks: "default"`, refusal/max_tokens handling) is covered with fakes and the SDK's own types only. The
   stable system prompts (~1k tokens) are probably below the cacheable minimum, so expect no cache hits yet.
4. **Docker images untested** (no daemon here). Dockerfiles use `pnpm deploy --legacy`; verify the first build.
5. **Categorisation on the server is demo-only.** The product categorises on the device; the server only stores
   what it receives. The persona rules in `packages/db/src/demo-inbox.ts` stand in for the user's own edits.
6. **WhatsApp templates** (`weekly_report_v1`, `monthly_report_v1`) are a stub; the session-window image + document
   path is what runs. The 24-hour window and opt-in rules need the Meta business setup first.
7. **Kiswahili copy** is tagged `[[COPY-REVIEW]]`; the fact-checker does not catch numbers written as words.
8. The ajv contract test validates fixtures and enums; it does not generate a JSON Schema from Zod for a full diff.

## Where to resume

- First real sends: `docs/sprint/DEMO-RUNBOOK.md` §4 (`live-delivery`) once Resend and Meta secrets exist; then
  point the provider webhooks at a public URL and watch `deliveries.status` move to `delivered`.
- First live model run: runbook §5 (`try:model`), then a worker run with `AI_ENABLED=true` and the daily cap;
  record usage and cost in `docs/PROGRESS.md`.
- Docker: build both images once (`make dev-app`) and fix `pnpm deploy` fallout if any.
