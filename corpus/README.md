# corpus/ — redacted real money messages (parser fixtures)

Every parser in Hesabu is tested against this folder. A message family is "done" only when the
parser passes **real, redacted** samples of it; a format with no sample here is unverified, however
plausible it looks (master prompt §6). Target: **≥ 30 messages per family per provider**.

**Privacy.** Nothing in this folder may contain a real name, phone number, account number, ID
number, e-mail address or transaction code. The redaction tool enforces that; review its output
before you commit, and open an issue if you see a leak. The original message text never leaves your
laptop: only its SHA-256 is stored, for de-duplication.

## 1. Export your inbox (Android)

1. Install **SMS Backup & Restore** (SyncTech) from Google Play.
2. Open it → **Set up a backup** (or **Backup now**).
3. Back up **Messages** only. Turn **MMS off** (tick *SMS*, untick *MMS* / *Include MMS*); call
   logs are not needed. The default options ("Add readable date", "Add contact names") are fine,
   the tool ignores both.
4. Choose a local folder (not a cloud drive) and run the backup. You get a file such as
   `sms-20261012123456.xml`.
5. Copy that XML to your laptop. It contains **all** your text messages, so keep it outside the
   repository, never `git add` it (`.gitignore` does not cover it), and delete it when you are done.

The XML looks like this (one `<sms>` element per message; `type="1"` is received, `type="2"` is
sent; `date` is epoch milliseconds; the body is an XML attribute):

```xml
<smses count="1" backup_set="…" backup_date="…">
  <sms protocol="0" address="MPESA" date="1696000000000" type="1" subject="null"
       body="QA10TEST01 Confirmed. Ksh1,500.00 sent to …" read="1" status="-1" locked="0"
       date_sent="0" readable_date="29 Sep 2023 18:06:40" contact_name="(Unknown)" />
</smses>
```

## 2. Run the redaction tool

```sh
# 1. see which alphanumeric sender IDs your phone actually has (verifies senders.default.json)
python3 tools/redact-sms/redact_sms.py ~/Downloads/sms-20261012.xml --out corpus/ --dry-run --list-senders

# 2. dry run with statistics and every redacted body printed, read them
python3 tools/redact-sms/redact_sms.py ~/Downloads/sms-20261012.xml --out corpus/ --dry-run --stats --print

# 3. write the corpus (idempotent: re-running merges and de-duplicates on sha256)
python3 tools/redact-sms/redact_sms.py ~/Downloads/sms-20261012.xml --out corpus/ --stats
```

Options: `--sender NAME[=provider/slug]` keeps an extra sender ID (repeatable); `--all` keeps every
received message regardless of sender (your personal texts would be redacted and written too, so
only use it to discover unknown senders, with `--dry-run`); `--include-sent` also keeps messages you
sent; `--salt TEXT` salts the transaction-code mapping (use the same salt on every run so a reversal
still points at its original code); `--senders-file` swaps the allow-list.

Sender IDs are matched case-insensitively against `tools/redact-sms/senders.default.json`. That file
is **to be verified against real exports**: only `MPESA`, `AirtelMoney` and `TKASH` have been seen
in public code, every bank entry is a guess. Fix the file when `--list-senders` shows you the truth.

Tests: `python3 -I -m unittest discover -s tools/redact-sms -p 'test_redact_sms.py'` (or
`python3 -I tools/redact-sms/test_redact_sms.py`).

## 3. Folder layout

```
corpus/
  README.md
  mpesa/
    2025-09.jsonl                      ← your redacted messages, one file per provider and month
    unverified-public-samples.jsonl    ← bodies copied from public web pages (see §5)
    MISSING-FAMILIES.md                ← families with no real sample yet
  airtel-money/   tkash/   banks/<bank>/   wallets/<name>/   other/<sender>/
```

`<provider>` comes from the senders file (`mpesa`, `airtel-money`, `tkash`, `banks/equity`,
`banks/kcb`, …; `other/<slug>` for `--all` or `--sender X` without a provider).

Each JSONL line:

| field | meaning |
|---|---|
| `sender` | the SMS `address` exactly as exported (e.g. `MPESA`) |
| `provider` | folder slug derived from the sender |
| `body` | the **redacted** message text, whitespace and line breaks preserved |
| `received_at` | ISO 8601 with offset, Africa/Nairobi (`2025-09-03T12:34:00+03:00`) |
| `family_guess` | keyword guess of the message family (§4); a parser decides for real |
| `redacted` | always `true` |
| `source` | `sms-backup-xml` (your export) or `public-web` (§5) |
| `redactor_version` | tool version that produced the line, so a rule change can be re-run |
| `sha256` | SHA-256 of the **original** body; de-duplication key; the original is never stored |

## 4. What a "message family" is

A family is one template a provider sends for one kind of event: M-PESA *Send Money*, *Pay Bill*,
*Buy Goods*, *Withdraw*, *Deposit*, *Airtime*, *Fuliza drawdown*, *Fuliza repayment*, *M-Shwari
deposit/withdraw*, *KCB M-PESA*, *Bank → M-PESA*, *M-PESA → bank*, *Reversal*, *Pochi la Biashara*,
*balance query*, *failed*. Families map to the `transactions.type` enum in master prompt §5. The
tool's `family_guess` values (`send_money`, `send_money_no_phone`, `receive_money`, `paybill`,
`buy_goods`, `withdraw`, `deposit`, `airtime`, `data_bundles`, `fuliza_drawdown`, `fuliza_repay`,
`fuliza_limit`, `mshwari_deposit`, `mshwari_withdraw`, `mshwari_loan`, `kcb_mpesa`, `bank_to_mpesa`,
`mpesa_to_bank`, `reversal`, `balance`, `failed`, `jumbe`, `mpesa_card`, `global_send`,
`bank_alert`, `airtel_money`, `unknown`) are only anchor-keyword guesses for counting; the provider
pack's family matcher is authoritative. A family's wording also drifts over time (compare the 2013
and 2026 samples cited in `docs/research/sms-formats.md`), so keep old samples when you get them.

## 5. The `unverified` flag

`unverified-public-samples.jsonl` files hold message bodies **copied verbatim from public web pages**
(parser repositories, blog posts, Safaricom's published samples), redacted with the same tool, with
`"unverified": true`, a `source_url` and a `source_note`. They show what a family probably looks
like; they were never checked against a device export, some may be hand-edited by their authors,
and `"illustrative": true` marks examples that a page presents as a template rather than a capture.
A parser may be *developed* against them but is **not done** until it passes redacted messages from a
real export (`source: sms-backup-xml`). Do not add to these files by hand; add a source and re-run
the generator described in `docs/research/sms-formats.md`.

## 6. Rules

- **Fixtures are never edited to make a parser pass.** If a parser fails on a corpus line, fix the
  parser, or ask the human for a fresh real sample. The only edits allowed here are removing a line
  that leaked personal data (then fix the redactor and re-run the export) or regenerating a file with
  a newer `redactor_version`.
- Never commit the XML export or any unredacted body. Review `--print` output before committing.
- One message, one line, one family. Keep promotional trailers ("Earn interest daily on Ziidi
  MMF…"); parsers must tolerate them.
- Count what you have: the tool prints families per provider; put the counts in the sprint/phase
  report and in `MISSING-FAMILIES.md`.

## 7. What the redactor does (and does not) change

Kept verbatim: amounts (`Ksh1,205.10`, `Ksh 4940.16`), currency words, dates, times, balances, fees,
daily limits, anchor words (`Confirmed`, `New M-PESA balance is`, `Transaction cost`), USSD codes,
URLs, and the names of public institutions on the `public_counterparties` list (`KCB BANK 501901`,
`Equity Paybill Account`, `SAFARICOM DATA BUNDLES`, `M-Shwari`, `KPLC`…), including the short code
that follows them.

Changed: transaction codes → a different code of the same shape (letters stay letters, digits stay
digits; the same input code always maps to the same output, so a reversal still references its
original); phone numbers → first 2 and last 3 digits kept (`0722358700` → `07XXXXX700`,
`254729901555` → `25XXXXXXX555`); names after `sent to`, `paid to`, `received … from`, `cash to`,
`for account`, `Dear`, agent lines (`from 347031 - …`) and ALL-CAPS runs after `to`/`from` →
`REDACTED PERSON` when a phone number is adjacent in the clause, otherwise `REDACTED MERCHANT`;
account references and other numbers of six or more digits → `XXX` + last 3; national ID numbers and
`JumbeID` → `REDACTED ID`; e-mail addresses → `redacted@example.com`.

Known limits: numeric transaction IDs (Airtel) are masked like account numbers; the person/merchant
label is a heuristic (a Pochi la Biashara vendor is a person but shows as `REDACTED MERCHANT`);
`xml.etree` is not hardened against malicious XML, so only feed it your own export.
