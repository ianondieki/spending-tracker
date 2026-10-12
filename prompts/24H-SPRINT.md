# 24-hour sprint — Hesabu "Day One"

**Goal of the 24 hours.** The product working end to end for one user (you): the Android app on your phone reads your
real money messages, keeps a categorised ledger with charts, generates last week's and last month's reports from the
backfilled history, delivers them to your email and your WhatsApp, and is scheduled to keep doing so. Signed APK,
tagged `v0.1-day-one`.

**What 24 hours cannot contain (and what unlocks each).** Public WhatsApp sending to any number (Meta Business
verification, days to weeks); Play Store listing (SMS declaration review, one to three weeks); trust in the live
schedule (one real weekly and one real monthly cycle); parsers for providers whose messages are not on your phone
(real samples from other people); ODPC registration and legal text (the human); the Ask assistant, local-only mode,
statement import, full Kiswahili, the device matrix. These stay in the master prompt's R2 and R3.

**How the day is won.** Run the build as four parallel Claude Code sessions (lanes) against contracts frozen in the
first two hours, with you doing the only things the agents cannot: creating accounts, exporting your inbox, installing
the APK, reading the reports. The master prompt's principles still apply; its phases do not. Expect a large token
spend: four Opus-class sessions for most of a day.

---

## Before hour 0 (you, about 60 minutes, nothing blocks on the agents)

1. **Anthropic API key** with a spend cap set in the console.
2. **Email:** a Resend (or Postmark) account; the default test sender is enough to email yourself.
3. **WhatsApp:** a Meta developer app with the WhatsApp product added. Note the **test phone number**, its phone
   number ID and a temporary access token, and add your own number as a verified recipient (up to five allowed, no
   business verification needed). Then **send any message from your phone to the test number**: that opens a 24-hour
   service window in which the API may send free-form text, images and documents to you without template approval.
4. **Your inbox:** install an SMS backup app that exports XML (for example SMS Backup & Restore), export all messages,
   copy the XML to your laptop. The redaction tool turns it into the corpus in hour 1.
5. **Phone:** developer mode and USB debugging on; `adb` working on your laptop. Battery optimisation off for the app
   once installed (Tecno, Infinix and Xiaomi need this).
6. **Postgres:** either Docker on your laptop or a free managed instance; one connection string.
7. **Tunnel:** `cloudflared` or `ngrok` so Meta and Resend webhooks can reach a backend running on your laptop. Deploy
   properly after the 24 hours.
8. **Decisions:** the app name for today, the week start (Monday), report times, which providers are in your inbox.

---

## Hour-by-hour

| Hours | Who | Work | Done when |
|---|---|---|---|
| 0–2 | Orchestrator session | Freeze the contracts: transaction schema, provider-pack JSON format, `FactsSheet` and `ReportDocument` schemas, the minimal OpenAPI (device token auth, sync, reports, deliveries), chart spec, design tokens (type, palette, semantic money colours). Scaffold the monorepo and the Android project. CI builds a debug APK as an artifact on every push. | Contracts committed; empty app builds in CI; four lane kickoffs written. |
| 1–2 | You + Lane D | Run `tools/redact-sms` on your XML export; commit the corpus (every message family present in your inbox, redacted). | Corpus committed with counts per family. |
| 2–12 | **Lane A Android** | Theme from tokens; prominent disclosure and permission flow; live receiver; 12-month backfill; a pack-driven parser engine (reads the JSON packs); Room with SQLCipher; sync client; Home, Transactions (with category correction and "Teach"), Accounts, Reports (archive, open, share hero PNG and PDF via the share sheet); designed empty, loading and error states. | APK installs; backfill parses your inbox; sync succeeds. |
| 2–12 | **Lane B Backend + agents** | API with a single-user device token (OTP auth is deferred); Postgres schema and migrations; `packages/analytics` facts sheet; report workflow collect → insight-select → write → check → render → deliver with the Anthropic SDK (structured outputs, fact-checker, numbers-only fallback); scheduler in Africa/Nairobi; email via Resend; WhatsApp sender for the Cloud API test number (free-form image + caption + PDF inside the service window, template path stubbed); delivery tracking. | `POST /reports/generate?period=last_week` produces a report and delivers it to you. |
| 2–12 | **Lane C Charts + renderer + web** | `packages/charts` (donut, daily bars with average, top-N bars, trend, fee meter, sparkline) in both themes; hero PNG 1080×1350 and chart PNGs via Playwright; PDF from the print stylesheet; React Email template; web viewer behind a signed link. | Seeded facts render to hero, charts, PDF, email and web; screenshots at 360 and 1440. |
| 2–10 | **Lane D Parsers** | Provider packs for every family in your corpus (M-Pesa first, then whatever else is there); anchored fields; golden tests; transfer matching and dedupe rules; the taxonomy and merchant seeds for your actual merchants. | ≥ 99 % on your corpus; zero double counting on your bank↔M-Pesa transfers. |
| 12–15 | Orchestrator + you | Integration on the real phone: install, backfill, sync, generate last week and last month, receive email and WhatsApp. Fix loop across lanes. | Both reports in your inbox and on WhatsApp with correct numbers. |
| 15–19 | Lanes A and C | Design pass: `frontend-design` → `impeccable` → `dataviz` on the hero and the four main screens; dark mode; 360 px; chart text summaries; the report copy reviewed against the tone rules. | `ux-reviewer` PASS on the main screens and the hero. |
| 19–22 | Lane B + you | Live schedule test: set the weekly time to five minutes ahead and confirm automatic delivery; signed links expire; secrets fail closed; redaction before every model call verified in logs; cost per report measured; README and a one-page runbook. | Automatic send observed; cost per report recorded. |
| 22–24 | Everyone | Buffer for whatever broke; `reviewer` pass on each lane; tag `v0.1-day-one`; write `docs/PROGRESS.md` with the deferred list. | Tag pushed; deferred list written. |

---

## Lane kickoff prompts (paste one per session after the orchestrator commits the contracts)

**Orchestrator (hour 0).** Read `CLAUDE.md`, `prompts/MASTER-BUILD-PROMPT.md` §2, §4, §5, §8–§10 and this file. This is
the 24-hour sprint, not the phased plan: skip gates and phase reports, keep the principles. In the next two hours
freeze and commit the contracts in `contracts/` (transaction schema, provider-pack format, `FactsSheet`,
`ReportDocument`, minimal OpenAPI with device-token auth, chart spec, design tokens), scaffold the monorepo and the
Android project so CI builds a debug APK artifact, write `tools/redact-sms` for an SMS Backup & Restore XML export,
then write the four lane kickoffs into `docs/sprint/lanes.md` with the exact files each lane owns. Stop when the
contracts are committed.

**Lane A — Android.** Read `CLAUDE.md`, `docs/sprint/lanes.md`, `contracts/`, and master prompt §6 and §12. You own
`android/` only. Build the app described in the hour 2–12 row for Lane A, using the provider-pack engine (packs are
data in `contracts/provider-packs/`, Lane D writes them), the design tokens, and the share-sheet delivery. Keep CI
green so the APK artifact is always installable. Commit every working step.

**Lane B — Backend and agents.** Read `CLAUDE.md`, `docs/sprint/lanes.md`, `contracts/`, and master prompt §5, §8, §9,
§11. Load the `claude-api` skill before any SDK code. You own `apps/api`, `apps/worker`, `packages/analytics`,
`packages/agents`. Build the hour 2–12 row for Lane B: single-user device token auth, sync, facts sheet, the report
workflow with the deterministic fact-checker and numbers-only fallback, scheduler, Resend email, the WhatsApp Cloud API
test-number sender (free-form inside the service window), delivery tracking. Fakes for every provider in tests.

**Lane C — Charts, renderer, web.** Read `CLAUDE.md`, `docs/sprint/lanes.md`, `contracts/`, and master prompt §10 and
§12. Load `dataviz` before the first chart and `frontend-design` before the hero. You own `packages/charts`,
`apps/web`, `packages/report-model`. Build the chart catalogue in both themes, the hero PNG and chart PNG rendering via
Playwright, the PDF, the React Email template and the signed web viewer, all from `ReportDocument`.

**Lane D — Parsers and taxonomy.** Read `CLAUDE.md`, `docs/sprint/lanes.md`, `contracts/`, `corpus/`, and master
prompt §6 and §7. You own `contracts/provider-packs/`, `corpus/` tests, and the taxonomy and merchant seeds. Write a
pack for every message family in the corpus with anchored fields and golden tests, the transfer-matching and dedupe
rules, and seeds for the merchants that actually appear. Never invent a format that is not in the corpus; list the
families you could not cover.

---

## After the 24 hours (the master prompt's phases resume from here)

Meta Business verification and the real sender number with utility templates; Play listing with the SMS declaration
and the share-to-app import path; phone OTP auth for a second user; the Ask assistant; providers beyond your inbox as
samples arrive; Kiswahili; accessibility and the low-end device pass; local-only mode; statement import; the security
audit; ODPC and legal copy.
