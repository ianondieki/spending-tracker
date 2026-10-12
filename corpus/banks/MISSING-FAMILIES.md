# Banks and cards — families and samples

Status on 2026-10-12. **No verbatim bank or card alert from a Kenyan bank was found on a public
page**, so there is no `unverified-public-samples.jsonl` here. What exists are fragments and parser
hints, listed so that a pack author knows what to look for (all unverified):

| Institution | Hint | Source |
|---|---|---|
| Equity Bank | a public SMS reader detects Equity alerts with `Equity Bank`, `Acc. No:` and `Amt:` and reads `credited` / `debited` | BusinessSalesTracker `SMSReader.js` (see research note) |
| Co-operative Bank | detected with `Co-op Bank` / `CO-OP BANK` / `credited with` | same |
| KCB card | truncated example `USD 19.00 transaction made on KCB card 5249***5733 at LARAVEL FORGE on 15/01/2026 16:08pm…` | PesaLog `sms-patterns.ts` comment |
| unknown bank/app | truncated `Dear LAWRENCE WAINAINA, you have sent Ksh. 670.0 to LUGXURIOUS T/A …` | same |
| unknown sender (B2C to M-PESA) | truncated `EVITECH COMPUTER SOLUTION LTD has transferred KES 37500.00 to your MPESA…` | same |
| Equity, Co-op, Absa | alert fees (KES 2.26 / 42 / 5 per alert, 2023) — proves alerts exist, says nothing about wording | Techweez, Business Daily |

Bank → M-PESA and M-PESA → bank transfers *are* covered on the M-PESA side (`corpus/mpesa/`); what is
missing is the bank's own alert for the same movement, which the transfer matcher needs to avoid
double counting (master prompt §6).

Missing for every bank (Equity, KCB, Co-op, NCBA, Absa, Stanbic, StanChart, I&M, DTB, Family, NBK…):
debit alert, credit alert, card purchase, ATM withdrawal, fee/charge, loan repayment, standing order,
internal transfer, PesaLink, M-PESA ↔ bank alert, balance, OTP (to ignore). Sender IDs are unverified
too (`tools/redact-sms/senders.default.json`).

Pack status (lane D, 2026-10-12): no real bank pack. `contracts/provider-packs/demo_bank.json` is a **synthetic**,
demo-only pack for a fictional bank (sender `HESABUDEMO`) so that `corpus/demo/` can show a salary credit and a
bank-to-M-PESA transfer pair; it says nothing about any real bank's wording. See `docs/DECISIONS-NEEDED.md`.
