# M-PESA — families with and without public samples

Status on 2026-10-12, before any real export was run through `tools/redact-sms`. "Public sample"
means a body copied verbatim from a public page into `unverified-public-samples.jsonl` (redacted,
`unverified: true`); none of them counts towards the ≥ 30-per-family target. Sources and format
notes: `docs/research/sms-formats.md`.

## Families with at least one public sample (32 lines)

| Family (master prompt §5 type) | Public samples | Notes |
|---|---|---|
| Send Money (`SEND_MONEY`) | 2 | English and Kiswahili (`Imethibitishwa … imetumwa kwa`) |
| Receive Money (`RECEIVE_MONEY`) | 4 | from a person; with Safaricom-masked sender `0710***123`; without a number (business-side receipt); from ZIIDI MMF (no "at" before the time) |
| Pay Bill (`PAYBILL`) | 2 | numeric and alphanumeric account references |
| Buy Goods / Till (`BUY_GOODS`) | 1 | `paid to NAME. on d/m/yy at h:mm PM.New M-PESA balance` |
| Withdraw at agent (`WITHDRAW`) | 1 | `Confirmed.on d/m/yy at h:mm PMWithdraw Ksh… from 347031 - AGENT` |
| Deposit (`DEPOSIT`) | 1 | `Give Ksh… cash to AGENT` — the deposit label comes from parser conventions and the 2013 pesaPi documentation, not from Safaricom |
| Airtime (`AIRTIME`) | 2 | own number; another number (`New balance is` without `M-PESA`) |
| Data bundles (paybill-shaped) | 1 | `sent to SAFARICOM DATA BUNDLES for account SAFARICOM DATA BUNDLES` |
| Fuliza drawdown (`FULIZA_DRAWDOWN`) | 2 | `Interest charged` (2023) and `Access Fee charged` (2025) wordings; carries the code of the payment it funded |
| Fuliza repayment (`FULIZA_REPAY`) | 2 | fully / partially |
| M-Shwari withdraw (`MSHWARI_WITHDRAW`) | 1 | `Transaction cost Ksh.0.00` (dot before the digits) |
| M-Shwari deposit (`MSHWARI_DEPOSIT`) | 1 | |
| KCB M-PESA (`KCB_MPESA`) | 1 | withdraw from KCB M-PESA to M-PESA |
| Bank → M-PESA (`BANK_TO_MPESA`) | 2 | `from STANBIC to MPESA Retail 300248`, `from NCBA BANK` (no short code) |
| M-PESA → bank (`MPESA_TO_BANK`) | 1 | `sent to Equity Paybill Account for account 07…` — paybill-shaped, bank detected by name |
| Reversal (`REVERSAL`) | 2 | credited back; debited (you were the recipient) |
| Pochi la Biashara (`POCHI`) | 2 | a send with no phone number and a "POCHI" trailer (probably a Pochi payment, unverified); "has not joined the service" failure |
| Balance query (`BALANCE_QUERY`, ignored) | 1 | |
| Failed (`FAILED`, ignored) | 1 | |
| M-PESA GlobalPay card | 1 | `sent to M-PESA CARD for account AMAZON RETAIL …` |
| Jumbe (split notification) | 1 | Safaricom's own sample, second SMS for till payments since July 2026 |

Pack status (lane D, 2026-10-12): every family in the table above has a draft family in
`contracts/provider-packs/mpesa.json` (26 families; the Jumbe, balance and failed messages are ignore families; the
"send without a number" sample is the inferred `pochi_send` family at confidence 0.7), all `verified: false`. All 32
public lines parse (`pnpm --filter @hesabu/pack-engine corpus`).

## Families with NO public sample (need the human's export or a real sample from someone)

| Family | What we know | Why it matters |
|---|---|---|
| M-Shwari loan disbursement / repayment (`MSHWARI_LOAN`) | nothing verbatim; Safaricom's FAQ only shows a balance template | loans & credit category |
| M-Shwari Lock Savings | nothing | savings category |
| KCB M-PESA deposit to savings / loan | one deposit example exists but its code (`UF1AB2CD34`) looks hand-made, so it was not copied | savings and loans |
| Fuliza limit change | only a one-line template in a README (`Your Fuliza M-PESA limit has increased from Ksh 2000 to Ksh 3000.`), no code or date | informational only |
| Global send (`GLOBAL_SEND`: Western Union / WorldRemit / M-PESA Global) | only synthetic-looking fixtures | out-of-country transfers |
| International receive (WorldRemit, Remitly, Wise → M-PESA) | nothing | income |
| Cross-network send (M-PESA → Airtel Money / T-Kash number) | nothing | family & friends |
| Lipa na M-PESA merchant receipt (business side, till or paybill owner) | only a truncated example (`Confirmed. Payment of KES. 150.00 to … Till No. … has been received. Ref. …`) and a 2013 `Ksh50.00 received from 254… NAME New Account balance` | business users |
| Pochi la Biashara, both sides, verified | the two samples above are inferred from trailers only | the §5 `POCHI` type |
| Hustler Fund disbursement / repayment | nothing | loans |
| M-PESA Ratiba (standing orders), Bill Manager | nothing | recurring payments |
| Reversal request declined / pending (`Reversal` sender) | nothing | reversal state |
| Fuliza "daily charges" query, overdraft reminders | nothing | fees |
| Kiswahili variants of every family except Send Money, balance and airtime | three Kiswahili bodies exist in one public parser (send, balance, airtime); only send was copied | i18n |
