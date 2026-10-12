# @hesabu/pack-engine

**Owner:** Lane D (parsers and taxonomy). The TypeScript reference implementation of
`contracts/PROVIDER-PACKS.md`: loads the JSON packs in `contracts/provider-packs/`, matches a message to a family,
extracts and normalises fields, and post-processes (dedupe, transfer pairs, balance chain). The Kotlin engine in
`android/` implements the same semantics against the same packs; both run the same corpus in CI.

## Pipeline

```
sender filter → families in order (prefilter, then pattern) → fields → normalisers → Transaction
                                                     ↓ no family
                                                  unknown (counted, never uploaded)
postProcess(): dedupe (provider, external_ref, family_id | raw_hash) → transfer matching → balance chain
```

- `loadPackFile(file)` / `loadAllPacks()` validate against `contracts/provider-pack.schema.json` (Ajv, draft 2020-12),
  then reject any pattern outside the portable regex subset (`validatePortableRegex`), any `fields` entry naming an
  undeclared group, and any datetime format that does not compile. A rejected pack throws `PackLoadError` listing
  every problem; nothing from it is ever used (fail closed).
- `parseMessage(pack, { sender, body, received_at }, { variables })` returns `not_ours | unknown | ignored | parsed`.
  `variables` fills `account_ref_template` (`sim_msisdn_masked`, `acct_mask`); they come from the device, never from
  the message, and a missing variable throws.
- `postProcess(parsed[])` returns the kept transactions, the duplicate count, the transfer pairs and the balance-chain
  breaks (advisory, never alter amounts).
- `runExamples(pack)` runs every family example against the pack; `runCorpus(packs, lines)` runs a corpus JSONL.

## Semantics the contract leaves implicit (mirror these in the Kotlin engine)

Recorded in `docs/sprint/CONTRACT-REQUESTS.md` as clarifications, not changes:

1. **Body pre-normalisation.** Only U+00A0 (no-break space) is replaced by a space before matching, because Java's
   `\s` excludes it and JavaScript's includes it. `raw_hash` is the SHA-256 of the untouched body.
2. **Phone normaliser and masks.** Redacted (`07XXXXX617`) and provider-masked (`0710***123`) numbers keep their
   placeholders as masked digits: `X` and `*` count as digits, `*` becomes `X`, then the first 2 / last 3 rule applies.
3. **`occurred_at` fallback.** A family with no datetime group (Fuliza drawdown and repayment) uses `received_at`.
4. **Amount prefixes** are stripped longest-first, one at a time, so `Ksh.` beats `Ksh`. Packs may also capture the
   digits only (`Ksh\s?(?<amount>[\d,]+\.\d{2})`), which every M-Pesa family does.
5. **Account reference masking.** `account_ref` captured from a paybill message is masked when it looks like a phone
   (`07XXXXX790`) or has a run of six or more digits (`XXXXX653`), per the transaction schema's note.
6. **Balance chain.** Transactions sharing an `external_ref` are one event: a balance-less Fuliza drawdown is applied
   before the payment it funded, whatever order the two SMS arrived in. A `FULIZA_DRAWDOWN` fee is charged to the
   loan, not to M-PESA, so it does not move the M-PESA balance. Balance-less transactions still move the running
   balance; only balance-carrying ones are checked.
7. **Deterministic ids.** `Transaction.id` is a UUID derived from `(pack_id, family_id, raw_hash)`; a transfer pair id
   is derived from the two transaction ids. The same inbox gives the same ids on every engine and run.
8. **Unmapped groups** in a pattern are allowed and ignored; a non-ignore family must map an `amount`.
9. **Datetime formats** support single-quoted literals (`'at'`, `'saa'`); a space matches any whitespace run;
   matching is case-insensitive. Seconds are not a token: capture the group without them.

## CLI

```sh
pnpm --filter @hesabu/pack-engine build
node packages/pack-engine/dist/cli.js validate                       # every pack in contracts/provider-packs
node packages/pack-engine/dist/cli.js examples [--pack file]          # examples are the tests
node packages/pack-engine/dist/cli.js run --corpus corpus/mpesa/unverified-public-samples.jsonl [--pack file] [--json]
```

`run` prints per-family counts, duplicates, transfer pairs, balance-chain breaks and every unknown body; exit code 1
when any message from a known sender is unknown.

## Tests

`pnpm --filter @hesabu/pack-engine test` runs the unit suites (regex subset, normalisers, post-processing) and
`packs.test.ts`, which loads every pack, runs every example, and runs every `corpus/**/*.jsonl` (except `corpus/demo`,
which has its own suite) against the packs. An unknown message fails the build unless the provider's
`MISSING-FAMILIES.md` contains the first 12 hex characters of its `sha256`, or the line is `illustrative: true`.

## Conventions

- ESM + TypeScript strict (`tsconfig.base.json`), NodeNext resolution: relative imports end in `.js`.
- `src/index.ts` is the public surface. Other workspace packages import `@hesabu/pack-engine` only.
- Tests live in `src/**/*.test.ts` (Vitest).
