# @hesabu/taxonomy

**Owner:** Lane D (parsers and taxonomy). **Purpose:** the category taxonomy, the merchant table and the
provider-type categorisation defaults from master prompt §7. Transfers are not spending; fees are first-class;
cash withdrawals are untracked.

## What is in here

| Path | What it is |
|---|---|
| `data/taxonomy.json` | The two-level category taxonomy: 22 top-level groups (exactly §7, in order) and their sub-categories. Each category has `id`, `parent_id`, `name_en`, `name_sw`, `kind`, `is_spending`, `hideable`, `sort`, `icon`. `version: 1`. |
| `data/provider-defaults.json` | Rules from a transaction `type` (plus optional `direction`, `counterparty_kind`, `provider`) to a category id and confidence. Every `TxType` in `contracts/transaction.schema.json` is covered; `category_id: null` means "no default, needs the merchant table or the model". |
| `data/merchants.json` | Merchant seeds for Kenyan paybills, tills and SMS names (KPLC, Safaricom, banks, DStv, SHA, KRA, supermarkets, ride-hailing, lenders, betting, generic church/tithe…). |
| `src/index.ts` | Typed loader and lookups: `categories`, `categoryById`, `childrenOf`, `topLevelCategories`, `topLevelOf`, `isSpendingCategory`, `isHideableCategory`, `SYSTEM_CATEGORIES` / `SYSTEM_CATEGORY_IDS` / `isSystemCategory` / `systemCategoryId`, `merchants`, `merchantById`, `normaliseName`, `matchMerchant`, `providerDefaultRules`, `providerDefaultCategory`, `resolveCategory`. |

The JSON files are the source of truth. `src/index.ts` reads them with `fs` relative to `import.meta.url`
(so the same code runs from `src/` in tests and from `dist/` at runtime; `data/` ships in the package via
`files`) and validates every record on load. A malformed file throws at import time rather than silently
miscategorising: fail closed.

### Category ids

Stable snake_case; sub-categories are prefixed by their parent (`transport.ride_hailing`, parent `transport`).
Never rename an id; add new ones at the end of a group and bump `version`. `kind` is one of
`spending | income | transfer | cash | fee | system`; `is_spending` is false for `transfer`, `cash` and
`income` and true for `spending`, `fee` (reported separately, but money that left) and `system`
(`uncategorised` is still spending until the user says otherwise). Only `betting_gaming.*` is `hideable`.

Legacy names from the scaffold still work: `SYSTEM_CATEGORIES` is `['uncategorised', 'transfer', 'fees']` and
`SYSTEM_CATEGORY_IDS` maps them to `uncategorised`, `transfers`, `fees_charges`.

### Resolution order

`resolveCategory(input)` implements the middle of the §7 order: **merchant table → provider default → none**.
User rules run before it (in the app and the backend) and the model after it; `source: 'none'` means "send to
the model, else Uncategorised". Confidences: paybill/till match 0.95; exact alias 0.9; prefix or whole-word
contains alias 0.8; provider defaults carry their own confidence (airtime, Fuliza, withdrawals 0.95; KCB
M-Pesa 0.6 because the type cannot tell savings from loans).

`matchMerchant({ name, paybill, till })` tries an exact paybill, then an exact till, then the name against
aliases (case-insensitive, punctuation stripped, whitespace collapsed; longest alias first; exact, then prefix,
then whole-word contains, so `NAIVAS LTD KILIMANI` → Naivas and `BLACKSMITH` does not hit `ACK`). When several
seeds share a number (KRA, NTSA and eCitizen all use the Government paybill 222222) the name disambiguates.

## How other lanes use it

- **Lane A (Android):** copy `data/*.json` into `android/app/src/main/assets/taxonomy/` verbatim (a Gradle
  task or `make sync-taxonomy`, to be added by Lane A) and read them with the same semantics as `src/index.ts`:
  ids, `is_spending`, the rule order and the alias normalisation above. Keep the `version` fields with the
  ledger so a re-categorisation can be re-run when the data changes. Do not fork the files.
- **Backend (Lane B):** `import { resolveCategory, categoryById } from '@hesabu/taxonomy'` (runtime resolves to
  `dist/`; tests resolve to `src/` via the Vitest alias). The data files ship inside the package.
- **Reports (Lane C):** `name_en` / `name_sw` and `icon` for labels; `isSpendingCategory` to exclude transfers,
  cash and income from spending totals; `hideable` to honour the betting toggle.

## Verification policy for merchants

`verified: true` only when `source_url` is an **official page that was actually fetched and shows the number**
(the fetch date is `verified_on` in the file). Everything else is `verified: false` with `source_url: null`,
even when every third-party guide agrees; a note says why. Never set `verified: true` from memory, a blog or a
paybill directory. Unverified numbers are still used for matching (a wrong seed is corrected by the user, whose
correction becomes a rule) but should be confirmed against a real SMS in `corpus/` before they are relied on
for reporting. Never edit `corpus/` fixtures to make a seed match.

Verified on 2026-10-12: KPLC prepaid 888880 and postpaid 888888 (kplc.co.ke), Nairobi Water 444400,
DStv 444900, KRA / Government paybill 222222 (kra.go.ke notice, also used for eCitizen), Co-op Bank 400200,
KCB 522522, Tala 851900. Safaricom, SHA, HELB, Betika, SportPesa, Zuku, Faiba, NCBA, Equity and Absa pages
either blocked the fetch, returned errors or did not show the number, so those seeds are unverified.

## Copy review

`name_sw` (Kiswahili) is ordinary copy written by the agent and tagged for human review: `copy_review: true`
in `data/taxonomy.json` and `[[COPY-REVIEW]]` here. A Kiswahili speaker should review every `name_sw` before
the first release; the ids and `name_en` do not change when they do.

## Conventions

- ESM + TypeScript strict (`tsconfig.base.json`), NodeNext resolution: relative imports end in `.js`.
- `src/index.ts` is the public surface. Other workspace packages import `@hesabu/taxonomy` only.
- Types resolve from `src/` (no build needed for `pnpm typecheck`); runtime imports resolve to `dist/`
  (`pnpm build` at the root builds in dependency order).
- Tests live in `src/**/*.test.ts` (Vitest) and read `contracts/transaction.schema.json` to assert that every
  `TxType` and `CounterpartyKind` is covered.

## Scripts

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm clean`

## Display names and merchant lists (`normaliseMerchantName`, `isMerchantCounterparty`)

Money SMS carry merchant names as raw upper-case text. `normaliseMerchantName(raw, { paybill?, till? })` returns the
name a report shows: a seed match (number first, then an alias that **starts** the name) gives the seed's
`display_name` (or `name`), keeping a named branch ("NAIVAS LTD KILIMANI" → "Naivas Kilimani"); otherwise the text is
title-cased with trailing legal suffixes (LTD, LIMITED, PLC, CO, INC…) and bare branch tokens removed, acronyms on the
allow-list (KPLC, DSTV, GOTV, NHIF, SHA, NSSF, KRA, NTSA, KCB, NCBA, DTB, I&M, ATM…) kept upper-case and Safaricom
spellings applied (M-PESA, M-Shwari, Fuliza). A name that is already mixed case is returned with only its whitespace
collapsed. `display_name` is an optional seed field for seeds whose canonical `name` is descriptive.

`isMerchantCounterparty({ counterparty_kind, type })` is false for M-Pesa agents (`agent`, and the WITHDRAW /
DEPOSIT / ATM types), people, banks and the user's own accounts, so analytics can keep cash withdrawals out of
"where the money went" merchant lists. The packs already mark withdrawals and deposits with `counterparty_kind: agent`.
