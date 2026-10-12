# Research note — Kenyan money-SMS formats and sender IDs

Written 2026-10-12 for `tools/redact-sms` and the provider packs. Every claim is tagged
**[verified-from-source]** (the cited page shows exactly that) or **[unverified]** (inferred,
second-hand, or the page could not be fetched). "Verified-from-source" means the text exists on that
page; it does **not** mean Safaricom, Airtel or a bank confirmed it. The redacted bodies live in
`corpus/*/unverified-public-samples.jsonl`; the generator that produced them (verbatim bodies →
`Redactor.redact_body`) is reproducible from the URLs below.

## 1. SMS Backup & Restore XML export

- Root `<smses count="…" backup_set="…" backup_date="…" type="full">`, one `<sms>` per message with
  attributes `protocol` (0 for SMS), `address` (sender/recipient), `date` (Java epoch ms), `type`
  (1 received, 2 sent, 3 draft, 4 outbox, 5 failed, 6 queued), `subject`, `body`, `toa`, `sc_toa`,
  `service_center`, `read`, `status`, `locked`, `date_sent`, `sub_id`, optional `readable_date` and
  `contact_name` (`(Unknown)` when not a contact). **[verified-from-source]**
  https://synctech.com.au/sms-backup-restore/fields-in-xml-backup-files/
- Real exports on GitHub match that shape, including an `<?xml-stylesheet … href="sms.xsl"?>`
  line, a `<!--File Created By SMS Backup & Restore v… -->` comment and `address` holding an
  alphanumeric sender ID (`address="M-Money"` for MTN Rwanda). **[verified-from-source]**
  https://github.com/hycienti/momo-sms-data-analysis/blob/d17336d5b64ee995c149865cfc26284da9a77499/_backend/sms.xml ,
  https://github.com/jlcanela/smslinks/blob/7d99d18687a89641a7ec3298fc28ca94d560fa34/data/sms-sample.xml
- MMS are separate `<mms>` elements with `<part>` children; the tool ignores them. **[verified-from-source]** (same field page)

## 2. Sender IDs

| Sender | Evidence | Status |
|---|---|---|
| `MPESA` | used as the SMS address in public parsers and fixtures: `registry.parse(senderId = "MPESA", …)` https://github.com/peteretelej/sms-transaction-parser/blob/3145d9e936966747865d0f2252664344af099cff/README.md ; `address: "MPESA"` https://github.com/Brightmuk/messaging/blob/c4b60ba1c37289ab404e367f5cf979497b1abd1c/lib/cubit/single_chat_cubit.dart ; `canHandle` accepts `MPESA`/`M-PESA` https://github.com/sarim2000/pennywiseai-tracker/blob/f73f90f57a4c5bb27ba583f321e48987f6651c8c/parser-core/src/main/kotlin/com/pennywiseai/parser/core/bank/MPESAParser.kt | **[verified-from-source]** that developers see `MPESA`; whether `M-PESA` also occurs is **[unverified]** |
| `AirtelMoney` | `address: "AirtelMoney"` on an Airtel bundle message in the Brightmuk demo (above) | **[unverified]** (demo data) |
| `AIRTELMONEY`, `AIRTEL`, `TKASH`, `TELKOM`, `SAFARICOM` | an operator table in a public project lists `mpesa_ke: ['MPESA','M-PESA','SAFARICOM']`, `airtel_ke: ['AIRTELMONEY','AIRTEL']`, `tkash_ke: ['TKASH','TELKOM']` https://github.com/jnnseya-cpu/KODA/blob/ad81a33739dcb8dd3c97569e9bc1f8b46bb857ab/app/shared/operators.js | **[unverified]** (someone else's expectation) |
| Bank IDs (`EQUITYBANK`, `KCB`, `CO-OPBANK`, `NCBA`, `ABSA`, `Stanbic`, `StanChart`, `I&M`, `DTB`, `FamilyBank`…) | no public evidence found; Kenyan alphanumeric sender IDs are registered per operator through a licensed content service provider https://www.telerivet.com/blog/kenya-sms-sender-id-compliance-safaricom | **[unverified]** |
| `Reversal` | Safaricom says reversal updates come "from the header Reversal" https://www.businessdailyafrica.com/bd/corporate/companies/m-pesa-users-to-reverse-wrong-transactions-on-sms-2171894 (search snippet; page not fetched) | **[unverified]** |

Action: run `redact_sms.py --dry-run --list-senders` on a real export and correct
`tools/redact-sms/senders.default.json`.

## 3. M-PESA Kenya — structure that holds across the samples

Observed in the cited fixtures (each bullet **[verified-from-source]** for the cited file,
**[unverified]** as a statement about Safaricom's templates):

- A 10-character upper-case alphanumeric code starts every confirmation (`RLB4TZCW5Q`,
  `UFDNT7QQ3C`); 2011–2014 samples had 9 characters (`BS49OR201`, `ET04TG335`) and were line-wrapped.
  https://github.com/ngareleo/mapesa/blob/1eb182bde566b6800f0f3b5a29327687aff87890/devtools/.store/sms ,
  https://github.com/pluspeople/pesaPi/blob/413a22497db46afc0deabe46b6d282265b64bdd9/php/documentation/mpesa_private_examples.txt
- `Confirmed.` follows the code; received messages often have no space (`Confirmed.You have received`),
  airtime uses lower case (`confirmed.You bought`), withdrawals glue the time to the verb
  (`at 5:55 PMWithdraw Ksh2,000.00`). https://github.com/Meshack-pi/mpesa/blob/0e20f7b0e85a112c10210d0d7dd188b7eea1d81c/sample_transactions.txt
- Three amounts share the `Ksh` prefix: amount, `New M-PESA balance is Ksh…`, `Transaction cost,
  Ksh…`; some families add `Amount you can transact within the day is …`. Fuliza and repayment
  messages write `Ksh 100.00` with a space and `M-PESA balance is` without `New`; M-Shwari messages
  write `Transaction cost Ksh.0.00`. (mapesa, Meshack-pi above)
- Dates are `d/m/yy`, times `h:mm AM/PM`; one ZIIDI receipt omits `at` (`on 20/6/26 2:25 PM`);
  Jumbe uses `Date: 2026-06-10 at 14:56:38`. (Meshack-pi; Techweez below)
- A Fuliza drawdown is a second SMS carrying the **same code** as the payment it funded
  (`TI387A5E16` on both the KPLC paybill and the Fuliza message).
  https://github.com/mwerekania/CompScienceFinalProject/blob/5d24c410b2f9e19a18b2382116114a6983d393a7/personal_finance_manager/data/september_sms_transactions.txt
- Promotional trailers change over time and must be ignored by parsers: `PIN YAKO SIRI YAKO` (2013),
  `Separate personal and business funds through Pochi la Biashara on *334#`, `Earn interest daily on
  Ziidi MMF,Dial *334#`, `Download My OneApp on https://saf.cx/…`, `To reverse, forward this message
  to 456`. (all files above)
- Business-side receipts mask the payer's number (`0710***123`) and append `To view the Full Number,
  forward this message to 334.` https://github.com/jaksoftwares/kapuletu-backend/blob/be5e30b8549fc48e09c0704f8351b0467d6ce54d/data/demo_messages.txt
- Kiswahili variants exist: `Imethibitishwa Ksh1.00 imetumwa kwa … tarehe 13/1/25 saa 5:44 PM. Baki
  yako ya M-PESA ni Ksh263.47. Gharama ya kutuma ni Ksh0.00.`, `Umenunua Ksh5.00 ya mjazo …`
  https://github.com/n-cognto/Duplex-mpesa-parse/blob/e7392d4870216856577145709d94342789f26a03/mpesa-parse-ToolKit.py
- Jumbe / split notifications (Safaricom FAQ and merchant terms dated 6 July 2026): a second SMS for
  till payments without the balance: `UFAL477KQJ Confirmed. You sent: Ksh2,000.00. Received by: Petrol
  Station Till. TILL: 5678900. Your JumbeID: NK_74. Date: 2026-06-10 at 14:56:38.`
  **[verified-from-source]** https://techweez.com/2026/10/06/safaricom-jumbe-mpesa-split-notifications/
- Safaricom's M-Shwari FAQ publishes a balance template `{M-PESA Receipt Number} Confirmed. Your
  M-Shwari Deposit Accountbalance is Kshs***** on {TransactionDate:d} at {TransactionTime:t}.`
  **[unverified]** — seen only in a search snippet; the page returned HTTP 403 to this session
  https://www.safaricom.co.ke/media-center-landing/frequently-asked-questions/m-shwari-faqs-safaricom

### 3.1 Family → sample URL (bodies are in `corpus/mpesa/unverified-public-samples.jsonl`)

| Family | Source file(s) | Status |
|---|---|---|
| Send Money | mapesa `.store/sms`; Kiswahili: Duplex toolkit | verified-from-source |
| Receive Money | mwerekania `september_sms_transactions.txt`; kapuletu `demo_messages.txt`; Meshack-pi | verified-from-source |
| Pay Bill | mwerekania (Sept and `TestData.txt`) | verified-from-source |
| Buy Goods | mapesa | verified-from-source |
| Withdraw | Meshack-pi; also https://github.com/n-cognto/Duplex-mpesa-parse (README) | verified-from-source |
| Deposit `Give Ksh… cash to` | mwerekania `TestData.txt`; labelled "depositing cash" in pesaPi docs; one public README labels the same wording "Withdrawal" (https://github.com/brian6870/pesaflow) | wording verified, **label unverified** |
| Airtime | mapesa; https://github.com/KOKUMUbooker/pesa-scope/blob/1464c679e5afbb3146be4a0988fcef0f89803b28/PesaScope.Tests/MpesaSmsParserTests.cs | verified-from-source |
| Data bundles | Meshack-pi | verified-from-source |
| Fuliza drawdown / repay | mapesa; mwerekania; https://github.com/Ianodad/FuliTrack/blob/1acbd7051adc2aaee8b6a5d937e72f67617c6027/README.md | verified-from-source |
| M-Shwari deposit / withdraw | Meshack-pi; pesa-scope; pesaPi (2013) | verified-from-source |
| KCB M-PESA | https://github.com/ngenohkevin/ledga/blob/42236c88e407e95626999eda83a8c37e9bc6e507/app/src/test/java/com/ledga/app/parser/MpesaSmsParserTest.kt | verified-from-source (author calls it real) |
| Bank → M-PESA | mapesa (`KCB 1 501901`, `STANBIC to MPESA Retail 300248`); mwerekania (`STANDARD CHARTERED BANK 329299`, `NCBA BANK`); https://github.com/gituajames/financelogger/blob/8052accdddadbeb0ba7bb5e2dcec064cc3074183/fin/finlogger/utils.py (`CO-OP BANK 149444`) | verified-from-source |
| M-PESA → bank | Meshack-pi (`Equity Paybill Account`); mapesa (`DTB Account`); mwerekania (`Lipa na KCB`); pesa-scope (`IM BANK C2B`) | verified-from-source |
| Reversal | Meshack-pi; pesa-scope; Brightmuk (debited variant); pesaPi 2013 (`Transaction EQ47FM754 has been reversed`) | verified-from-source |
| Pochi la Biashara | mapesa (`sent to Duke  Okari on …` + `To receive Money on POCHI`), Meshack-pi (`has not joined the service`) | wording verified, **family inferred** |
| Balance, Failed | Meshack-pi | verified-from-source |
| M-PESA GlobalPay card | pesa-scope | verified-from-source |

Illustrative (not copied): imagetotable.ai shows send / paybill / buy goods / receive / deposit
examples that match the shapes above https://imagetotable.ai/blog/mpesa-screenshot-transaction
**[unverified]**; pub.dev ParsePesa examples use a different, probably invented shape (`ID: AGT7766XYZ`)
https://pub.dev/packages/parsepesa/versions/2.0.0/example **[unverified]**.

## 4. Airtel Money Kenya

- No captured transaction SMS found. A third-party payments guide gives "example SMS format" lines
  (`Airtel Money: You sent KES 1,500.00 to JOHN DOE (0712345678) on 15/12/2024 at 2:30 PM. Your new
  balance is KES 8,500.00. Transaction ID: AIR123456789. Charges: KES 15.00.`) with a placeholder ID
  **[verified-from-source as an illustration; unverified as a real format]**
  https://docs.reply.cash/docs/sending-kenya/airtel-money-deep-dive
- One demo fixture with address `AirtelMoney`: `41594319234 Confirmed. You have successfully purchased
  a bundle of Ksh 500 via Airtel Networks Kenya Ltd on 09/03/26 at 08:03 AM. Fee: Ksh 0. Bal: Ksh
  1,200.00` **[unverified]** (Brightmuk demo above). Note the numeric transaction ID and the
  `Fee: … Bal: …` labels.
- Airtel's agent terms define a confirmation SMS as a transaction summary sent to both parties
  **[verified-from-source]** https://airtelkenya.com/am-agents-terms-and-condition ; reversal
  guides ask for "the transaction ID from your original Airtel Money SMS" **[unverified]**
  https://paybillke.com/guides/how-to-reverse-airtel-money . USSD `*334#`, fees and limits:
  https://paybillke.com/airtel-money (secondary) and https://www.airtelkenya.com/ke/personal/tariffs-charges
  **[unverified; tariffs change]**.

## 5. T-Kash

- Nothing verbatim. Secondary guides only state that a confirmation SMS follows registration,
  activation (`*334#` / `*160#`), sends and airtime purchases **[unverified]**
  https://paybillke.com/t-kash , https://biznakenya.com/send-money-with-t-kash .

## 6. Banks and cards

- No verbatim alert found for Equity, KCB, Co-op, NCBA, Absa, Stanbic, StanChart, I&M, DTB or Family
  Bank. Parser hints: Equity alerts detected by `Equity Bank`, `Acc. No:`, `Amt:`; Co-op by `Co-op
  Bank` / `credited with` **[verified-from-source as a developer's regex, unverified as a format]**
  https://github.com/viking4839/BusinessSalesTracker/blob/d885de8584d96cb065b6eb0786709e703ecf5dea/src/Services/SMSReader.js
- Truncated examples in a parser comment: `USD 19.00 transaction made on KCB card 5249***5733 at
  LARAVEL FORGE on 15/01/2026 16:08pm…`, `Dear LAWRENCE WAINAINA, you have sent Ksh. 670.0 to
  LUGXURIOUS T/A …`, `EVITECH COMPUTER SOLUTION LTD has transferred KES 37500.00 to your MPESA…`,
  `Confirmed. Payment of KES. 150.00 to QUICK URBAN MINIMART Till No. 0766109079 has been received.
  Ref. UA33H2X9IB on 03-01-2026 at 16:30.` (merchant-side M-PESA) **[verified-from-source, truncated]**
  https://github.com/lawre17/PesaLog/blob/a8e337648d24932b657ef2c161aefeb1bcde8b2b/constants/sms-patterns.ts
- Alert fees (Equity KES 2.26 from 24 April 2023; Co-op KES 42; Absa KES 5) **[verified-from-source]**
  https://techweez.com/2023/04/26/equity-bank-intros-charges-for-sms-alerts/ — proves alerts exist,
  says nothing about wording.

## 7. Consequences for the build

1. Every M-PESA family in §3.1 can get a draft pack now, tagged unverified until the human's export
   passes through `tools/redact-sms` (≥ 30 per family).
2. Airtel Money, T-Kash and all bank packs cannot start from public data; they wait for exports.
3. Anchored fields are mandatory (three `Ksh` amounts per message); family matchers must tolerate
   missing spaces, missing `at`, promotional trailers, Kiswahili and the 2013-era line wrapping.
4. Fuliza drawdowns share the funded payment's code: dedupe on `(provider, external_ref)` must
   include the family, or the drawdown will be dropped as a duplicate.
