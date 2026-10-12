# Lane D report — provider packs, pack engine, taxonomy, demo inbox

Branch `claude/beautiful-pascal-w5oxu3-lane-d`. Status at the last update (see the bottom): kickoff items 1–5
shipped and green; item 6 (the user's real redacted export) has not arrived, so every family stays `verified: false`.

## What shipped

| # | Deliverable | Where | State |
|---|---|---|---|
| 1 | Pack engine (TypeScript reference implementation of `contracts/PROVIDER-PACKS.md`) | `packages/pack-engine` | schema validation (Ajv 2020-12) + portable-regex subset rejection at load, sender filter, prefilter, ordered families, six normalisers, Transaction builder, dedupe `(provider, external_ref, family_id)` / `raw_hash`, transfer pairing, balance chain with the Fuliza same-code rule, CLI (`validate`, `examples`, `run`), 106 tests |
| 2 | M-Pesa pack | `contracts/provider-packs/mpesa.json` v0.2.0 | 28 families (3 Kiswahili), 34/34 public samples parse, every amount anchored to its label, all examples `verified: false` |
| 3 | Other packs | `contracts/provider-packs/airtel_money.json` (1 family, confidence 0.6), `demo_bank.json` (3 families, synthetic, demo only) | T-Kash and real banks: nothing to build from; `MISSING-FAMILIES.md` in every corpus folder says so |
| 4 | Taxonomy | `packages/taxonomy` | 22 groups / 109 ids with en and sw names (`[[COPY-REVIEW]]`), 38 provider-default rules covering all 30 TxTypes, 77 merchant seeds (9 verified with URLs), `matchMerchant`, `resolveCategory`, JSON in `data/` for the app and backend, 76 tests |
| 5 | Demo inbox | `corpus/demo/demo-inbox.jsonl` + `demo-inbox.expected.json` + generator | 82 messages, eight Monday weeks, 100 % parsed, 1 duplicate dropped, 3 transfer pairs, 0 balance breaks, one Fuliza episode |
| 6 | Real export | — | not received; re-checked at every hourly merge |
| + | Report display names (orchestrator package 2) | `packages/taxonomy/src/display.ts` | `normaliseMerchantName`, `isMerchantCounterparty`, optional `display_name` on 22 seeds |
| + | Cross-engine parity dumps (orchestrator check-in 1) | `corpus/expected/`, `pack-engine dump`, `src/dump.test.ts` | canonical JSONL per corpus file and for the demo inbox; the Kotlin engine asserts byte identity |

## How to run

```sh
pnpm install
pnpm --filter @hesabu/pack-engine test          # engine + every pack example + every corpus file + demo inbox + fuzz
pnpm --filter @hesabu/taxonomy test
pnpm --filter @hesabu/pack-engine build
node packages/pack-engine/dist/cli.js examples
node packages/pack-engine/dist/cli.js run --corpus corpus/mpesa/unverified-public-samples.jsonl
pnpm --filter @hesabu/pack-engine demo:write     # regenerate corpus/demo after changing the generator or a pack
```

When the real export lands (`corpus/<provider>/<yyyy-mm>.jsonl` with `source: sms-backup-xml`):

```sh
node packages/pack-engine/dist/cli.js run --corpus corpus/mpesa/2026-09.jsonl   # unknowns are printed; exit 1
```

Fix patterns in the pack (never the fixture), add a real body as an example with `verified: true`, list any still-unknown
message's 12-char `sha256` prefix in that provider's `MISSING-FAMILIES.md`, and record per-family accuracy here.

## Test counts

| Package | Tests |
|---|---|
| `@hesabu/pack-engine` | 121 (regex subset 28, normalisers 45, post-processing 9, packs and corpus 24, demo 8, fuzz 4, dump 7, engine clarifications 8) |
| `@hesabu/taxonomy` | 98 (incl. 22 for display names and merchant-list filtering) |

Root `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` are green for the whole monorepo at the last push.

## Decisions and clarifications made

- **Demo bank is synthetic.** The kickoff wants a salary credit and bank↔M-PESA transfer pairs in the demo, and also
  forbids invented formats. `demo_bank.json` describes a fictional bank with sender `HESABUDEMO`, says so in every
  description, and should be loaded only in demo mode. Recorded in `docs/DECISIONS-NEEDED.md` with three options for
  the human. `HESABU DEMO` is also in the M-Pesa pack's bank-name alternations for the same reason.
- **Engine clarifications** the contract leaves implicit (NBSP, masked-phone placeholders, `occurred_at` fallback,
  prefix order, account-reference masking, Fuliza in the balance chain, deterministic ids, datetime literals) are in
  `packages/pack-engine/README.md` and `docs/sprint/CONTRACT-REQUESTS.md` for Lane A to mirror.
- **Unknown-message allow-list.** The corpus test accepts an unknown only if `MISSING-FAMILIES.md` contains the first
  12 hex characters of its `sha256`, or the line is `illustrative: true` (a template a web page showed, not a message).
- **Jumbe split notifications** are an ignore family (the Buy Goods SMS already carries the payment); the till number
  they carry is not yet merged into the transaction.
- **Pochi la Biashara** is inferred from a send-without-number sample at confidence 0.7, as the corpus notes warn.
- **No category defaults in packs.** Categorisation is the taxonomy's job (merchant table, then provider default), so
  packs carry only `type`, `direction` and `counterparty_kind`.

## Known gaps

- Every family is unverified: no real export yet. Airtel Money has one family; T-Kash and all real banks have none.
- Families with no public sample (M-Shwari loan, lock savings, KCB M-PESA deposit, Fuliza limit change, global send,
  international receive, cross-network send, merchant-side receipts, Hustler Fund, Ratiba, reversal pending/declined,
  Kiswahili variants beyond Send Money) are listed in `corpus/mpesa/MISSING-FAMILIES.md`.
- Kiswahili category names are machine-written copy (`copy_review: true`).
- 68 of 77 merchant seeds carry numbers or aliases without a fetched source (`verified: false`).
- Regex timing: Java's `CASE_INSENSITIVE` is ASCII-only and its `\s` excludes NBSP; the engine normalises NBSP only.
  Non-ASCII case folding differences are not expected in money messages.

## Where to resume

1. When `corpus/<provider>/*.jsonl` from the real export arrives: run the CLI over it, fix patterns, flip
   `verified: true` on bodies taken from it, record per-family accuracy below, bump pack versions.
2. If the human picks option (b) in `docs/DECISIONS-NEEDED.md`, remove `demo_bank.json`, the `HESABU DEMO` alternation
   and the bank events in `packages/pack-engine/src/demo/generate.ts`, then `pnpm demo:write`.
3. Lane A parity: assert `corpus/demo/demo-inbox.expected.json` from the Kotlin engine; diff per-family counts first.

## Per-family accuracy on the real export

Not available: no real export in `corpus/` at the time of writing.

## Hourly log

- 14:05 UTC: items 1–5 done and pushed (commits `da03aa2..07f43ff`); monorepo green; no real export.
- 14:56 UTC: orchestrator check-in 1 package done: merged the camelCase group-name fix, `pack-engine dump` + `corpus/expected/` with a drift test, Kiswahili airtime and balance families from the one public source, a test per engine clarification (`41fbc00`). No real export.
- 15:16 UTC: merged c588cf8; normaliseMerchantName + isMerchantCounterparty in @hesabu/taxonomy for Lane B's analytics. No real export.
