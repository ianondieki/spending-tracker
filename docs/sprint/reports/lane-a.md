# Lane A report: Android app

Branch `claude/beautiful-pascal-w5oxu3-lane-a`, everything under `android/`. Build: `cd android && export
ANDROID_HOME=/opt/android-sdk && ./gradlew assembleDebug testDebugUnitTest lint --no-daemon`. The debug APK lands at
`android/app/build/outputs/apk/debug/app-debug.apk`; CI uploads it as `hesabu-debug-apk`.

## What shipped (kickoff items in order)

1. **Theme.** Colours, type scale, radius, motion and chart ramp from `contracts/design-tokens.json`, with a parity
   test that fails when the Kotlin constants drift from the JSON. Schibsted Grotesk (variable TTF, OFL, licence in
   `android/THIRD_PARTY_FONTS.md`) bundled with tabular figures applied to digit runs (whole-string `tnum` widened the
   thousands comma in this font). `MoneyText` (`KSh 12,450`, right-aligned, in/out/fee/transfer colours, TalkBack
   reads "12,450 shillings"), `LedgerRow`, `Rule`/`DoubleRule`, `Tally` (rows then total under a double rule; one
   300 ms reveal, off under reduced motion), screen scaffolding with designed empty, loading and error states.
2. **Pack engine.** `parse/pack/`: sender filter, prefilter, portable-regex guard (rejects lookaround, backreferences,
   `\p{}`, possessive quantifiers, inline flags, `\b`, bad group names), six normalisers (strict Nairobi dates, two-digit
   years 2000–2099, phone masking `07XXXXX678`), first-match family selection, required-group failure falls through,
   ignore families, unknown handling. Post-processing: dedupe by `(provider, external_ref, family_id)` else raw hash,
   transfer pairing (10 minutes, opposite directions, different accounts, hint or self/bank; never withdrawals),
   balance-chain breaks (advisory only). Packs load from `assets/provider-packs/` (copied from `contracts/` by Gradle)
   plus `assets/provider-packs-builtin/` whose packs yield per sender to any contract pack. The built-in M-Pesa pack
   has 22 families and 38 examples; once Lane D's packs are present it is dropped and the contract packs (M-Pesa
   0.2.0 with 28 families, Airtel Money, the demo bank) run instead, reading all 35 known-sender samples in `corpus/`.
   `PackExamplesTest` runs every example of every loaded pack, `CorpusCoverageTest` runs `corpus/`, and `ParityTest`
   asserts this engine's canonical dump of every corpus file and the demo inbox is byte-identical to the TypeScript
   engine's `corpus/expected/` files (the nine clarifications in `packages/pack-engine/README.md` are mirrored:
   no-break spaces, 4000-character cap, first pack decides, last non-null group wins, redacted and masked digits,
   account-reference masking, the datetime mini-language, deterministic ids, closest-in-time transfer pairs, and the
   Fuliza-before-payment balance chain).
3. **Ingestion.** Welcome → prominent disclosure (lists the sender ids actually read, what leaves the phone, how to
   revoke) → `RECEIVE_SMS`, `READ_SMS`, `POST_NOTIFICATIONS` request → backfill progress (per-sender tally, double
   rule, total) → per-OEM background guidance (Transsion, Xiaomi, OPPO, vivo, Huawei, Samsung, other) with the battery
   settings intent. `SmsReceiver` runs the pipeline inside `goAsync()` with an 8 s budget; `InboxReader` pages the
   inbox through the ContentResolver with the sender filter in the SQL selection (other senders are never read);
   `BackfillWorker` (12 months default) and `ReconcileWorker` (every 6 h, last 14 days) share `InboxScan`.
4. **Data.** Room on SQLCipher (key in EncryptedSharedPreferences under a Keystore master key): transactions, accounts,
   unknown messages (body encrypted again with a Keystore AES-GCM key), categories, merchant seeds, user rules, sync
   queue; preferences in DataStore, device token in `SecretStore`. Taxonomy from `assets/taxonomy/` (copied from
   `packages/taxonomy/dist` when present, tolerant reader) with a built-in fallback of 23 categories (en/sw) and 78
   seeds. `Categoriser`: user rule → merchant seed (exact, then name prefix) → provider default → none.
5. **Sync.** `/v1/devices/register` then `POST /v1/sync` in batches of 500 (`Syncer` + `SyncWorker` with exponential
   backoff, network constraint, periodic safety net every 6 h). Server URL in Settings; no URL means nothing is sent;
   a 401 drops the token for re-registration; rejected rows stay queued with the reason. The wire models have no
   field for a message body and the test asserts no body text reaches the wire.
6. **Screens.** Home (week tally with day rows, received/fees/delta lines, accounts and balances, Teach Hesabu badge,
   recent rows, next report time computed from the schedule), Transactions (day groups with running totals, search,
   period/direction/account/category filters, detail sheet: category with "always use this" rule, mark as transfer,
   note, parser provenance), Teach Hesabu (unknown bodies decrypted on device, one-tap money out/in/transfer/fee with
   suggested amount, or "Not money"), Accounts (balance as of, month in/out/fees, last message), Settings (server,
   email, WhatsApp, weekly/monthly times, language en/sw applied live, theme, SMS consent review, AI consent off by
   default, demo mode, paste import, re-scan inbox, OEM help, pack versions, your M-PESA number stored masked).
   Reports (built by a sub-agent in its own worktree, reviewed and merged): list from `GET /v1/reports` grouped
   weekly/monthly with status and delivery state, a "Generate this week's report" action, and a native
   `ReportDocument` renderer for every section type (hero as the Tally, KPI grid, charts, insights, tables with
   right-aligned figures and a double-ruled total row, lists, callouts, watch list, footer). Compose charts under
   `ui/charts/`: donut, daily bars with average line, top bars, fee meter, balance sparkline, each with a "Show as
   table" view and a TalkBack description carrying the key numbers; the other chart types fall back to their alt
   text. Share image / share PDF download the artefact URLs into the app cache (15 MB cap, token sent only to the
   configured host) and open the Android share sheet through a FileProvider. Offline or in demo mode the bundled
   sample report (`assets/demo-builtin/sample-report.json`, validated against both schemas, every figure computed)
   is shown.
7. **Demo mode.** Settings toggle; `assets/demo/demo-inbox.jsonl` (from `corpus/demo` when merged) or the built-in
   29-message sample through the real pipeline, rows tagged `demo` and removed exactly when toggled off.
8. **Screenshots.** `ScreenshotTest` (Roborazzi) records every screen at 360×800 and 412×915, light and dark, into
   `android/screenshots/` on every unit-test run (56 PNGs committed, reports included). Reviewing them caught and
   fixed: tabular figures widening the thousands comma, a tally row never reaching full opacity, KPI truncation at
   360 dp, a clipped 56 sp hero amount, a squeezed label on the OEM screen.
9. **Import paths.** `ShareReceiverActivity` (ACTION_SEND text/plain) and the paste screen run `TextImport`: each block
   is tried against every pack to find its sender; what no pack claims goes to Teach Hesabu under the sender `shared`.

## Tests

`./gradlew assembleDebug testDebugUnitTest lint`: 276 unit tests green, lint with no errors, debug APK built. Suites: Money format and
parsing, design-token parity, ledger components (Compose/Robolectric), portable regex, normalisers, pack engine,
post-processing, pack examples (parameterised), corpus coverage, categoriser and taxonomy reader, body cipher,
ingest pipeline (in-memory Room), text import, demo inbox, periods, screen smoke tests, screenshots, sync protocol
(Ktor mock engine), report charts and sections, sample report validation, JSON pointer and chart mappers,
cross-engine parity. CI never reaches a network: the sync tests use `MockEngine`, reports use the bundled sample.

## Cross-engine parity

`ParityTest` runs `corpus/mpesa`, `corpus/airtel-money` and `corpus/demo/demo-inbox.jsonl` through the Kotlin engine
with the variables from `corpus/expected/README.md` and asserts the canonical JSONL equals the TypeScript engine's
committed dumps byte for byte. All three match. When Lane D regenerates `corpus/expected/`, this test is the first
thing to run.

## Known gaps and where to resume

- Kiswahili copy is machine-drafted and tagged `[[COPY-REVIEW]]`; category names in Kiswahili likewise.
- Share image / PDF is unit-tested for URL handling only; the sample report has no artefact URLs, so the download
  path needs a server to exercise end to end.
- The six-step categorical chart ramp from the design tokens fails the dataviz palette validator (grey steps too
  close); the charts compensate with direct labels, slice gaps and the table view. A design decision for the
  orchestrator.
- The Welcome and Disclosure screens do not yet ask for the M-PESA number; it lives in Settings.
- The built-in pack is English-only; Airtel Money, T-Kash and bank packs come from Lane D (`contracts/provider-packs/`).
  `CorpusCoverageTest` will show exactly what the merged packs miss.
- The M-PESA number is a Settings field stored masked; messages read before it is set stay filed under
  `mpesa:default` (dedupe keeps the first copy), so set it during onboarding in a later iteration.
- Notifications (report ready) are not implemented; the permission is requested for later use.
- SQLCipher runs only on a device; JVM tests use plain in-memory Room. Instrumented tests need an emulator.
- Lighthouse/axe do not apply to Compose; TalkBack labels and 48 dp targets were checked by hand in the screenshots.
