# Provider packs

Data-driven parser definitions, one JSON file per provider, validated against `../provider-pack.schema.json` and
executed by `packages/pack-engine` (TypeScript, tests and CLI) and the Kotlin engine in `android/`. Semantics:
`../PROVIDER-PACKS.md`; engine clarifications: `packages/pack-engine/README.md`. Owner: Lane D.

| Pack | Sender IDs | Families | Status |
|---|---|---|---|
| `mpesa.json` | `MPESA` (seen in public fixtures), `M-PESA` (unverified alias) | 28: send (en, sw), receive (person, no number, Ziidi), pay bill, buy goods, withdraw, deposit, airtime (own, other, sw), Fuliza drawdown and repayment, M-Shwari in and out, KCB M-PESA to M-PESA, bank to M-PESA, M-PESA to bank, GlobalPay card, Pochi (inferred), reversal credit and debit; ignore: Jumbe split notification, balance query (en, sw), failed (2) | every example `verified: false`: bodies come from `corpus/mpesa/unverified-public-samples.jsonl` (public parser repos), none from a real export yet |
| `airtel_money.json` | `AirtelMoney` (one public demo fixture) | 1: bundle purchase (confidence 0.6) | the only plausible capture found; every other Airtel Money family is missing (`corpus/airtel-money/MISSING-FAMILIES.md`) |
| `demo_bank.json` | `HESABUDEMO` | 3: credit, debit to M-PESA, other debit | **synthetic, demo only**: a fictional bank for `corpus/demo/`, because no real bank alert exists in the corpus. Load only in demo mode. See `docs/DECISIONS-NEEDED.md`. |

No T-Kash pack and no real bank or card pack: nothing verbatim exists for them (`corpus/tkash/`, `corpus/banks/`).
A family is added only when a message body exists in `corpus/`; a public body gives `verified: false`, a body from
the user's redacted export (`source: sms-backup-xml`) may flip to `verified: true`.

## Rules for editing a pack

- Families are ordered most-specific first; the first match wins. Run `node packages/pack-engine/dist/cli.js examples`
  after any change; `pnpm --filter @hesabu/pack-engine test` runs the examples and the whole corpus.
- Anchor every amount to its label (`sent to`, `New M-PESA balance is Ksh`, `Transaction cost, Ksh`); never capture
  "the first Ksh".
- Only the portable regex subset (named groups, `(?:…)`, classes, `\d \s \w`, `? * + {m,n}`, `^ $`, the dot, escaped
  punctuation). The engine rejects anything else at load time, so does CI.
- Group names are camelCase `[a-z][a-zA-Z0-9]*` (Java rejects underscores). `pnpm --filter @hesabu/pack-engine dump`
  regenerates `corpus/expected/` after any change; the Kotlin engine asserts against those files.
- Bump `version` (semver) on every change; the app records it on each transaction so a fixed pack can re-run.
- Never edit `corpus/` fixtures to make a pattern pass.
