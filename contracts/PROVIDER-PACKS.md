# Provider pack semantics

A pack is data. Two engines execute it with identical results: the Kotlin engine in `android/` (production) and the
TypeScript engine in `packages/pack-engine` (tests, the backend's pattern proposals). Both run the same corpus in CI.

## Evaluation

1. **Sender filter.** Trim and lower-case the message address; it must equal one of `sender_ids` (lower-cased). Messages
   from other senders are never read beyond this check.
2. **Family selection.** For each family in order: the `prefilter` must pass (every `all_of` substring present, no
   `none_of` substring present, case-insensitive), then `pattern` must match. First match wins; families are therefore
   ordered from most to least specific inside a pack.
3. **Fields.** Each named group is mapped by `fields`. Missing optional groups leave the field null. A required group
   that is missing makes the family fail and evaluation continues with the next family.
4. **Normalisers.**
   - `amount`: strip any `amount_prefixes` token and commas and spaces, parse as decimal with up to two places, store
     cents as an integer. `Ksh1,200.00` → 120000. `KES 50` → 5000.
   - `datetime`: try `datetime_formats` in order; interpret in Africa/Nairobi; emit ISO 8601 with `+03:00`. Two-digit
     years map to 2000 to 2099.
   - `text`: trim, collapse internal whitespace, keep case.
   - `phone`: keep digits, normalise `+254`/`254` to leading `0`, then mask to first 2 and last 3 digits for storage.
   - `code`: upper-case alphanumeric, trimmed.
   - `digits`: keep digits only.
5. **Outputs.** `type`, `direction`, `counterparty_kind`, `is_transfer_hint` come from the family. `fee_cents` is 0
   unless a `fee` field or `defaults.fee_cents` provides it. `parse_confidence` is the family `confidence`.
6. **Ignore families** (`ignore: true`) consume the message without producing a transaction; they still count as
   parsed, not unknown.
7. **Unknown.** A message from a known sender that matches no family is an unknown message: stored encrypted on the
   device, counted, surfaced in "Teach Hesabu", never uploaded unless the user allows the AI extractor (redacted).

## Portable regex subset

Both Java (`java.util.regex`) and JavaScript (`RegExp` with the `u` flag off) must give the same result. Use only:
named groups `(?<name>...)`, non-capturing groups `(?:...)`, alternation `|`, classes `[...]` and `\d \s \w \D \S`,
quantifiers `? * + {m,n}` (greedy and lazy `?`), anchors `^ $`, the dot, and escapes. Do not use lookbehind,
backreferences, `\p{...}`, possessive quantifiers, inline flags, or `\b` (word boundaries differ with Unicode). Match
case-insensitively (both engines compile with the case-insensitive flag). Named group names: `[a-z][a-zA-Z0-9]*` (camelCase, no underscores: Java rejects `_` in group names).

## Three amounts rule

Most M-Pesa messages carry three amounts (amount, transaction cost, new balance). Every amount group must be anchored
to its label in the pattern (`Confirmed\. ?(?<amount>Ksh[\d,]+\.\d{2}) sent to`, `New M-PESA balance is
(?<balance>Ksh[\d,]+\.\d{2})`, `Transaction cost,? ?(?<fee>Ksh[\d,]+\.\d{2})`). A pattern that captures "the first
Ksh" is rejected in review.

## Dedupe and transfers (cross-pack rules, implemented in both engines' post-processing)

- **Dedupe key.** `(provider, external_ref, family_id)` when `external_ref` exists, otherwise `raw_hash`. The family is
  part of the key because M-Pesa reuses one code across related messages: a Fuliza drawdown arrives as a second SMS
  carrying the same code as the payment it funded, and reversals cite the original code. A duplicate is dropped with a
  count.
- **Transfer matching.** Two transactions from different `account_ref`s of the same user, opposite directions, equal
  `amount_cents`, `occurred_at` within 10 minutes, where at least one family has `is_transfer_hint` or the
  counterparty kind is `self` or `bank`, become a pair: both get `is_transfer = true` and the same
  `transfer_pair_id`. Withdrawals (`WITHDRAW`, `ATM`) are not paired; they are categorised as cash withdrawals.
- **Balance chain.** For accounts whose messages carry `balance_after`, consecutive transactions must satisfy
  `prev.balance_after ± amount ± fee = this.balance_after` (sign by direction). A break flags a possible missed message
  and schedules a reconciliation scan. The flag is advisory; it never alters amounts.

## Examples are the tests

Every family ships with examples. `verified: true` is allowed only for bodies taken from `corpus/` (real, redacted
exports). The CI corpus job runs every pack against every corpus file for its sender IDs and fails if any message from
a known sender is unknown and not listed in that provider's `MISSING-FAMILIES.md`.

## Versioning

Semantic versions per pack. The app records `parser.pack_version` on every transaction so a fixed pack can re-run on
stored messages. Packs are shipped inside the app and can be updated over the air (later).
