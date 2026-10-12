# Airtel Money Kenya — families and samples

Status on 2026-10-12. **No verbatim, captured Airtel Money Kenya transaction SMS was found on any
public page.** `unverified-public-samples.jsonl` therefore holds four lines, all `unverified: true`:

| Line | What it is | Trust |
|---|---|---|
| bundle purchase (`… purchased a bundle of Ksh 500 via Airtel Networks Kenya Ltd … Fee: Ksh 0. Bal: Ksh 1,200.00`) | demo data in a public messaging-app repo, with the sender address recorded as `AirtelMoney` | plausible capture, unverified |
| send, receive, merchant payment (`Airtel Money: You sent KES 1,500.00 to …  Transaction ID: AIR123456789.`) | an "example SMS format" in a third-party payments provider's docs; placeholder transaction ID | `illustrative: true` — a template, not a message; do not treat the wording as real |

Families with **no** sample: Send Money, Receive Money, Pay Bill, Buy Goods (till), Withdraw at agent,
Deposit, Airtime, bank → Airtel Money and Airtel Money → bank, cross-network receive from M-PESA,
reversal, balance, failed. The sender ID (`AirtelMoney`? `AIRTELMONEY`? `Airtel Money`?) and the
transaction-ID format are also unverified; secondary sources only say a confirmation SMS with a
transaction ID is sent to both parties (`docs/research/sms-formats.md`).

Pack status (lane D, 2026-10-12): `contracts/provider-packs/airtel_money.json` has one family, `bundle_purchase`,
at confidence 0.6, built from the bundle line above. The three `illustrative: true` lines are reported as unknown by
the corpus test and allowed (they are templates, not messages); no family is built from them.

Next step: the human (or an Airtel Money user they know) runs `tools/redact-sms` on an export; until
then every Airtel Money format in a provider pack is unverified.
