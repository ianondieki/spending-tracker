# Lane B — Backend, analytics, agents, delivery

Contracts: all of `contracts/` (you implement `openapi.yaml`, produce `FactsSheet`, produce `ReportDocument`,
consume `renderer-interface.md`). Master prompt: §5, §8, §9, §11. Load the `claude-api` skill before writing any
Anthropic SDK code and follow it (official TypeScript SDK, `claude-opus-5-5` default, adaptive thinking, structured
outputs, prompt caching, no prefill, handle the `refusal` stop reason).

Deliver in this order:

1. **Database (`packages/db`).** Postgres schema and migrations (Drizzle or plain SQL with a runner): users, devices,
   consents, accounts, transactions, categories, merchants, rules, budgets, recurrences, reports, deliveries, insights,
   audit_log, report_links. Every table carries `user_id`; a query helper makes it impossible to query without one;
   a test proves cross-user reads return nothing.
2. **API (`apps/api`, Hono).** Every path in `openapi.yaml`: device registration with an HMAC-signed device token
   (`DEVICE_TOKEN_SECRET`, fail closed), idempotent sync upsert by id and `updated_at`, preferences, reports list, get,
   generate, deliver, the public signed-link resolver, unknown-message extraction (consent-gated), WhatsApp and email
   webhooks, health. Zod validation; a test validates the Zod mirrors against the JSON schemas with ajv.
3. **Analytics (`packages/analytics`).** Pure functions from a transaction window to a complete `FactsSheet` including
   deltas, categories, merchants, people, accounts, daily, time-of-day, largest, recurring, budgets, overdraft, income,
   six-month trend, year-to-date, anomalies, candidate insights (every kind in the schema that applies) and the flat
   `display_strings` list. Hand-computed expectations in tests; property tests for totals.
4. **Agents and fact-checker (`packages/agents`).** `insightSelect`, `write` (structured output to `ReportDocument`,
   en and sw), `judge`; the deterministic fact-checker (every money and percent token in copy must be in
   `display_strings`; dates and period labels allowed; one regenerate on failure); the numbers-only fallback writer
   that builds a full `ReportDocument` from i18n templates per insight kind (en and sw, in `packages/i18n`); cost and
   token accounting; `AI_ENABLED` and a daily USD budget with a kill switch; redaction helper; all SMS-derived text
   framed as data. Fakes for tests; a manual script exercises the real model when `ANTHROPIC_API_KEY` is set.
5. **Worker (`apps/worker`).** pg-boss on Postgres; the workflow collect → insight-select → write → check → render
   (through `@hesabu/renderer`, stub until Lane C lands) → deliver, idempotent per (user, kind, period_start) and per
   (report, channel); scheduler that computes each user's next weekly and monthly run in Africa/Nairobi; storage
   adapter (S3-compatible with a local-filesystem fake); signed, expiring report links; email adapter (Resend: HTML
   with inline `cid:` images and the PDF attached, plus a fake); WhatsApp adapter (Cloud API: upload media, send image
   with caption, send document; template path stubbed; status webhooks update deliveries; plus a fake).
6. **Demo seed.** `pnpm --filter @hesabu/db seed:demo` parses `corpus/demo/demo-inbox.jsonl` with
   `@hesabu/pack-engine` (after merging; inline sample until then) into a demo user, then `POST /v1/reports/generate`
   for `last_week` and `last_month` completes with the fallback writer and fake deliveries. An integration test covers
   this path end to end against the Postgres service in CI.
7. **Operations.** `make dev` brings up the stack and the API answers `/health`; Dockerfiles for api and worker; a
   README with curl examples for registering a device, syncing, generating and fetching a report.
