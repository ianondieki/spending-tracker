# Hesabu, state of the product (sprint day one, final)

Final version at the sprint wrap, 12:30 UTC 13 Oct 2026. Integration branch `claude/beautiful-pascal-w5oxu3`,
tag `v0.1-day-one`. The sprint is over (`docs/sprint/DONE.md`); the phase-per-session rules in `CLAUDE.md` apply
again from the next session.

## What works now

- **Android app** (`android/`): reads money SMS from M-Pesa, Airtel Money and the demo bank on the phone, 12-month
  backfill, live receiver, 6-hourly reconciliation, encrypted ledger (SQLCipher), categorisation from the bundled
  taxonomy, transfer matching, balance-chain checks, sync to the backend, Home, Transactions (search, filters,
  correction, "Teach Hesabu"), Accounts, Reports (native charts, share hero PNG and PDF), Settings, demo mode,
  share-to-app and paste import with a confirm step, prominent SMS disclosure, per-OEM background guidance,
  WhatsApp JOIN-code and email confirmation rows in Settings. Start-up opens the Keystore-backed passphrase, the
  SQLCipher ledger and the parsers off the main thread and shows "Hesabu could not open" with the cause and a retry
  when a phone's secure storage misbehaves; debug builds show their own crash screen with Copy and Share. 312 unit
  tests; screenshots at 360 and 412 px in both themes under `android/screenshots/`.
- **Backend** (`apps/api`, `apps/worker`): device-token auth with expiry and revocation, tenant-scoped Postgres with
  row-level security, sync, preferences, report generation (facts engine, insight selection, writer, fact-checker,
  numbers-only fallback), renderer (hero PNG, chart PNGs, A4 PDF, email), email and WhatsApp delivery adapters with
  fakes, scheduler in Africa/Nairobi, signed 30-day report links and 15-minute artefact URLs, verified-address
  consent, magic-link email confirmation, JOIN-code WhatsApp verification, size and rate limits. 693 node tests.
- **Reports**: eight rendered sample sets (weekly and monthly, English and Kiswahili, light and dark) under
  `docs/sprint/samples/`; the web report scores Lighthouse accessibility 100 and performance 98 (mobile).
- **Parsers**: 28 M-Pesa message families (two in Kiswahili), Airtel Money, a synthetic demo bank; the Kotlin and
  TypeScript engines produce byte-identical output on every corpus file and the demo inbox.
- **Security**: reviewed (`docs/sprint/reports/security-review.md`); the blocker and all six majors are fixed; the
  14 minors are listed for after the showcase.

## What needs you

1. **Secrets** in the cloud environment settings (never in chat or the repo): `ANTHROPIC_API_KEY`,
   `RESEND_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `REPORT_TO_EMAIL`, `REPORT_TO_WHATSAPP`. With
   them, a fresh session runs `docs/sprint/DEMO-RUNBOOK.md` and sends a real weekly report to you.
2. **Real messages**: 20 to 50 redacted M-Pesa and bank messages under `corpus/` (tool:
   `python3 tools/redact-sms/redact_sms.py export.xml --out corpus/ --stats`). Bank parsers are synthetic until a
   real bank alert exists (`docs/DECISIONS-NEEDED.md`).
3. **Meta test number**: add your number as a recipient and send it one message from your phone to open the
   24-hour window.
4. **Install the APK**: the fixed per-ABI builds (arm64 and arm32, from commit 430f7d4) were sent to you in the
   chat on 13 Oct; GitHub → Actions → `ci` run 91 or later → Artifacts → `hesabu-debug-apk` is the universal
   build of the same code (41 MB zip). Install, open, allow SMS on the disclosure screen, let the backfill run (or
   switch on demo mode in Settings). The first APK "kept stopping" on your phone; the fixed build either opens or
   shows "Hesabu could not open" with a Details box. If you see that box, or a "Hesabu stopped unexpectedly"
   screen, send its text (Copy details) to the developer: it names the exact failure on your phone.

## Showcase layers (details in `docs/sprint/SHOWCASE.md`)

- **A**: the app on your phone with your real messages, reports delivered to your email and WhatsApp.
- **B**: demo mode on the phone plus the stack on a laptop behind a tunnel (`infra/deploy/README.md`).
- **C**: the committed samples, `apps/web` fixtures, `android/screenshots/`, and the recordings in
  `docs/sprint/showcase/`.

## Known gaps

Automated WhatsApp to numbers other than Meta's five test recipients needs business verification. No real bank
message formats yet. The on-phone verdict on the fixed build is still open (no report back yet). The merchant
seeds on the phone read only each merchant's name; paybill, till and alias lists from `packages/taxonomy` are not
yet used on-device (the backend uses them). Ask assistant, local-only mode and statement import are out of the
day-one scope. The 14 security minors are listed in `docs/sprint/reports/security-review.md`.
