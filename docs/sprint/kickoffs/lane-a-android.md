# Lane A — Android app

Contracts: `contracts/design-tokens.json`, `transaction.schema.json`, `provider-pack.schema.json`, `PROVIDER-PACKS.md`,
`chart-spec.md`, `report-document.schema.json`, `openapi.yaml`. Master prompt: §6, §12. The scaffold in `android/`
builds (`./gradlew assembleDebug`); the Android SDK is at `/opt/android-sdk` in your container if the scaffold agent
installed it, otherwise install it the same way (command-line tools, platforms;android-35, build-tools;35.0.0).

Deliver in this order:

1. **Theme.** Material 3 colour schemes and typography from the tokens; bundle Schibsted Grotesk (OFL) as a font
   resource with tabular figures; the ruled-ledger components: `LedgerRow`, `Tally` (rows then a total under a double
   rule, with the single 300 ms reveal and reduced-motion off), `MoneyText` (right-aligned tabular numerals, `KSh
   12,450`, semantic colours in/out/fee/transfer).
2. **Pack engine (Kotlin).** Implements `PROVIDER-PACKS.md` exactly: sender filter, prefilter, portable regex with
   named groups, normalisers, post-processing (dedupe, transfer matching, balance chain), unknown handling. Packs load
   from `assets/provider-packs/` which a Gradle task copies from `../contracts/provider-packs/` at build time. Unit
   tests use your own inline pack fixtures plus whatever packs exist after merging the integration branch; a test
   runs every example in every pack.
3. **Ingestion.** Prominent disclosure screen, then the permission request (RECEIVE_SMS, READ_SMS, POST_NOTIFICATIONS);
   `SmsReceiver` for live messages; paged `ContentResolver` backfill of the inbox (default 12 months, progress with
   per-sender counts); a WorkManager reconciliation job every 6 hours; OEM background-restriction guidance screen.
4. **Data.** Room with SQLCipher (key in the Android Keystore): transactions, accounts, unknown messages (encrypted
   body), categories and merchant seeds from `assets/taxonomy/` (copied from `packages/taxonomy/dist` when present),
   user rules, sync queue, preferences. Category resolution: user rule → merchant seed → provider default → none.
5. **Sync.** Device registration and `POST /v1/sync` in batches of 500 with retry and backoff; base URL configurable
   in Settings; never upload message bodies.
6. **Screens.** Home (this week's tally, accounts and balances, unknown-messages badge, next report time);
   Transactions (grouped by day with running totals, search, filters, detail sheet: change category, mark as transfer,
   note; "Teach Hesabu" list for unknowns with one-tap labelling); Accounts; Reports (list from `GET /v1/reports`,
   open a report rendering `ReportDocument` sections natively with Compose charts for at least donut, daily bars and
   top bars; share hero PNG and PDF through the Android share sheet); Settings (server URL, email, WhatsApp number,
   language en/sw, report times, consents, demo mode). Every screen has designed empty, loading, error states.
7. **Demo mode.** A Settings toggle that feeds `corpus/demo/demo-inbox.jsonl` (from Lane D after merge; until then a
   small inline sample) through the real engine so the app can be shown without SMS access.
8. **Screenshots.** Roborazzi (Robolectric) screenshot tests at 360×800 and 412×915 in light and dark for every
   screen, PNGs committed under `android/screenshots/` so the orchestrator can review the design.
9. **Import paths.** Share-to-app (ACTION_SEND text) and paste import that run through the same engine.

Quality bar: `./gradlew assembleDebug testDebugUnitTest lint` green; the APK artifact uploads in CI; no message body
in any log; strings in `values/` and `values-sw/`; 48 dp targets; TalkBack labels.
