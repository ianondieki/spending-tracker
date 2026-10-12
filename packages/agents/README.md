# @hesabu/agents

The report workflow's model steps, the deterministic fact-checker, the numbers-only fallback, redaction and cost
caps. Orchestration is deterministic code with model steps; every number in a report comes from the
`FactsSheet` computed by `@hesabu/analytics`.

## Pipeline (`produceReport`)

```
guard.canSpend? ── no ──────────────────────────────────────────────▶ fallback
      │ yes
insight-select (model, ≤ 7 weekly / ≤ 12 monthly; failure → engine order)
      │
write (model) ── fails (refusal, max_tokens, parse, api_error) ────▶ fallback
      │
assemble + ReportDocumentSchema ── invalid ─────────────────────────▶ fallback
      │
fact-check + structural check ── problems ─▶ write again once with the problems attached
      │                                              └─ still problems ─▶ fallback
model document (meta: writer, model, tokens summed, cost, fact_check.attempts)
```

The fallback (`writeFallback`) builds a complete document from i18n templates and the sheet alone and always
ships. When the model chose insights, the fallback renders those; otherwise the engine's order. With
`runJudge: true` the eval judge scores the finished model document; it never blocks delivery.

## Modules

| Module | What it does |
|---|---|
| `env.ts` | `isAiEnabled(env)` (`AI_ENABLED=true` and a key), `readAiConfig(env)` → `{ enabled, model, dailyBudgetUsd, apiKey }`. `AI_DAILY_BUDGET_USD` defaults to 2; a malformed value means 0. |
| `cost.ts` | `PRICING` (Claude Opus 5.5: $4 in, $20 out, $5 cache write, $0.20 cache read per MTok), `estimateCostUsd` (unknown model priced at the highest known rates), `CostLedger` + `InMemoryCostLedger` (Nairobi calendar day), `BudgetGuard` with `canSpend(now)` and a runtime `killSwitch`. |
| `model-client.ts` | `ModelClient.structured()` returning a typed result or a typed failure. `AnthropicModelClient` (real SDK) and `FakeModelClient` (tests). |
| `redact.ts` | Masks phones (`07XXXXX678`), M-Pesa codes (`[CODE]`), 9+ digit accounts (`[ACCOUNT]`), 7–8 digit IDs (`[ID]`), emails (`[EMAIL]`); leaves names and amounts. Idempotent. |
| `fact-check.ts` | Every money token, percent and bare numeral in every copy string must be a display string; dates, period labels, clock times, years, day numbers next to month names, links and names from the sheet are allowed. |
| `fallback-writer.ts` | The numbers-only writer; chart catalogue (`CHART_CATALOGUE`) with stable chart ids and data refs. |
| `insight-select.ts`, `write.ts`, `judge.ts`, `extract.ts` | The model steps, each with a Zod output schema. |
| `prompts/` | Versioned system prompts (`*.v1.ts`) and `CHANGELOG.md`. All share `SAFETY_RULES`. |

## Model calls

`AnthropicModelClient` calls `client.beta.messages.parse` with `model: 'claude-opus-5-5'`, `max_tokens: 16000`,
the `server-side-fallback-2026-07-01` beta with `fallbacks: 'default'` (refusal fallbacks), the stable system
prompt first with `cache_control: ephemeral`, all volatile content (facts JSON, dates) in the user message
inside `<data>` tags, `output_config: { format: zodOutputFormat(schema), effort }`, no `thinking` field (adaptive
is the default) and no assistant prefill. Effort: `low` for insight-select and judge, `medium` for write and
extract.

Two SDK behaviours shape the code:

- `.parse()` runs the schema parse inside the SDK and throws on unparseable text before the caller can read
  `stop_reason`. The client wraps the format's `parse` so a problem yields `null`, then records usage, checks
  `stop_reason` (`refusal` and `max_tokens` are failures) and only then reads `parsed_output`.
- The SDK's schema transform (0.133) turns `enum`, `const`, `minimum`/`maximum` and `maxLength` into
  descriptions and records into empty objects. Those constraints are enforced only by the Zod parse on our side,
  so the write step's draft schema (`ReportDraftSchema`) leaves out `meta`, the identity fields and insight
  drill-downs; code fills them.

Every call records `{ step, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, at }` in the
ledger. No message text or other PII is logged.

## Trying the real model (manual, never in CI)

```sh
pnpm build   # from the repo root; the script runs dist/
AI_ENABLED=true ANTHROPIC_API_KEY=... AI_DAILY_BUDGET_USD=1 \
  pnpm --filter @hesabu/agents try:model [weekly|monthly] [en|sw] [--judge]
pnpm --filter @hesabu/agents try:model --dry-run   # same wiring, AI off, no network
```

It uses `sampleFactsSheet()` from `@hesabu/analytics` when present, otherwise the hand-built sheet in
`src/test-fixtures.ts`, and prints the document, usage, cost and ledger.

## Tests

Vitest with `FakeModelClient` (and a stubbed SDK for `AnthropicModelClient`); nothing reaches the network.
`src/test-fixtures.ts` holds hand-built weekly and monthly sheets validated with `FactsSheetSchema`.
`engine-contract.test.ts` runs the fallback and fact-check on the engine's own sample sheet when analytics
exports one.

## Scripts

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm clean` · `pnpm try:model`
