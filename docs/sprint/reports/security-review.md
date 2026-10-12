# Security review: Hesabu sprint build (integration branch `claude/beautiful-pascal-w5oxu3`, head `e2c0fad`)

**Verdict: CHANGES_REQUIRED** (1 BLOCKER, 6 MAJOR, 14 MINOR). Reviewer: `security-reviewer` (Fable 5.1), 12 Oct 2026.
Read-only review of the code as merged; claims in the lane reports were verified against the source, not taken on trust.

Severity scale (from the kickoff): BLOCKER = exploitable now in a way that exposes another user's data, leaks message
bodies, or sends to an unverified recipient; MAJOR = real weakness to fix before any external beta; MINOR = hardening.
Threat mapping uses the master prompt §13 list (stolen phone, malicious SMS, hostile app, compromised backend, insider,
abusive delivery/spam, token leakage via report links) plus STRIDE, because `docs/THREAT_MODEL.md` does not exist yet
(see MINOR-14).

## Ranked findings

| # | Sev | Where | Weakness | Threat (§13 / STRIDE) |
|---|---|---|---|---|
| B1 | BLOCKER | `apps/worker/src/deliver.ts:84-86`, `:63-65`; `packages/db/src/tenant.ts:176-191`; `apps/api/src/app.ts:127-133` | Delivery consent is a per-user flag, not bound to the address it was proven for: after one `JOIN`, `whatsapp_e164` (or `email`) can be changed to any number/address and the worker sends there | abusive delivery / spoofing, elevation |
| M1 | MAJOR | `apps/api/src/routes/whatsapp-webhook.ts:43`, `apps/api/src/routes/email-webhook.ts:43` | Webhook signature checks are skipped whenever the secret is unset, with no production gate (fails open); forged `JOIN`/`STOP`/status/bounce events are accepted | spoofing, tampering |
| M2 | MAJOR | `apps/api/src/routes/whatsapp-webhook.ts:76`; `packages/db/src/system.ts:109-112`; `packages/db/migrations/0001_init.sql:11` | `JOIN <code>` code is ignored; the number is matched with `LIMIT 1` and `users.whatsapp_e164` is not unique, so a second account claiming a victim's number can capture the victim's own JOIN | spoofing, abusive delivery |
| M3 | MAJOR | `packages/db/src/tokens.ts:34-51`; `apps/api/src/app.ts:89-99` | Device tokens carry `iat` only: no expiry, no revocation, no check that the device row still exists; a leaked token is valid until the global secret rotates | token leakage, stolen phone |
| M4 | MAJOR | `apps/api/src/app.ts:76-86`; `packages/db/src/system.ts:44-62` (`:59` audit actor); `migrations/0001_init.sql:28`, `:213` | `device_id` is the only credential and open registration mints a token for any known `device_id`; it is stored in clear in `devices` and in every `audit_log.actor` and every sync body | insider / compromised backend, spoofing |
| M5 | MAJOR | `apps/api/src/app.ts` (no `bodyLimit`, no limiter); `packages/analytics/src/contracts/transaction.ts:46,68,75-79` | No request-size limit and no rate limit on any route incl. unauthenticated `/v1/devices/register` and public `/v1/public/reports/:token`; several sync strings are unbounded | DoS (availability) |
| M6 | MAJOR | `apps/worker/src/adapters/storage.ts:75-79`; `apps/worker/src/workflow.ts:163-166`; `apps/api/src/app.ts:218` | Hero PNG and PDF URLs are plain bucket URLs (no signing, no expiry); they only work if the bucket is public-read, and then outlive the 30-day report link forever | token leakage / information disclosure |
| m1 | MINOR | `apps/worker/scripts/live-delivery.ts:38-39` | Picks the newest `done` weekly report across *all* users and sends it to the operator's `REPORT_TO_*` | insider, cross-tenant disclosure |
| m2 | MINOR | `packages/agents/src/cost.ts:135-153`; `apps/worker/src/workflow.ts:113`; `apps/api/src/extractor.ts:19` | Kill switch is an in-memory field on a guard created per job; nothing an operator can flip without a redeploy; no per-user or per-report cap, so one user can drain the global daily budget via `/v1/unknown-messages/extract` | DoS on AI budget |
| m3 | MINOR | `android/app/src/main/java/ke/hesabu/app/parse/pack/ParsedMessage.kt:21`; `packages/pack-engine/src/engine.ts:46,182` | `raw_hash` and the transaction id are unsalted SHA-256 of the message body and are synced; a server-side party can confirm guessed bodies for formulaic messages | compromised backend / information disclosure |
| m4 | MINOR | `android/app/src/main/AndroidManifest.xml` (no `networkSecurityConfig`); `SyncClient.kt:54` | `http://` server URLs accepted; cleartext allowed by platform default on API 26-27; no certificate pinning (spec §13) | stolen credentials in transit |
| m5 | MINOR | `android/.../ingest/ShareReceiverActivity.kt:23-31`; `TextImport.kt:52-60` | Any app can `ACTION_SEND` text that is ingested as a real M-PESA row (`source=share`) with only a toast; no preview/confirm step | hostile app on the device, tampering |
| m6 | MINOR | `apps/api/src/routes/whatsapp-webhook.ts:37`, `:59`; `email-webhook.ts:30` | Verify-token compare is not constant-time; Meta payloads have no replay window; provider `errors[].title/message` is stored in `last_error` and shown in the app unescaped by the API | spoofing, tampering |
| m7 | MINOR | `packages/db/src/tenant.ts:418-425`; no revoke route | `force` regeneration does not revoke prior links and there is no user-facing revocation; links live 30 days by default | token leakage via report links |
| m8 | MINOR | `.github/workflows/ci.yml` | No `permissions:` block (default token scope); no secret or dependency scanning job (spec §13 asks for both) | supply chain |
| m9 | MINOR | `infra/deploy/Dockerfile.backend:30-37` | Runtime stage has no `USER`; api and worker run as root in the Playwright image (the per-app Dockerfiles do set `USER node`) | compromised backend blast radius |
| m10 | MINOR | `pnpm-lock.yaml` | `pnpm audit --audit-level=high` reports 15 advisories (6 high, 9 moderate); not triaged in this sprint | supply chain |
| m11 | MINOR | `.env.example`; `apps/worker/src/adapters/renderer.ts:87` | `HESABU_RENDERER_ALLOW_STUB`, `API_BASE_URL`/`HESABU_API_BASE_URL`, `HESABU_DEV_ROUTES` are read but undocumented; the worker drops the renderer's `stubbed` flag, so with the stub flag set in production 1×1 placeholder artefacts would be delivered | misconfiguration |
| m12 | MINOR | `android/app/src/main/java/ke/hesabu/app/data/Daos.kt` (no purge); spec §13 | No 30-day purge of stored unknown-message bodies; no biometric/PIN app lock | stolen phone, compliance |
| m13 | MINOR | `packages/agents/src/prompt-data.ts`, `write.ts:101-104`; `fact-check.ts:187-221` | People and merchant names go to the model unredacted by design; the fact-checker masks names that contain digits, so a counterparty name carrying a phone number passes into the narrative verbatim (malicious-SMS vector; impact limited to the victim's own report, no side effects) | malicious SMS / injection |
| m14 | MINOR | `docs/` | `docs/THREAT_MODEL.md` referenced by CLAUDE.md does not exist; findings here cannot be mapped to a maintained table | process |

## Details

### B1. Delivery consent is not bound to the verified address (BLOCKER)

`deliverOne` sends WhatsApp when `prefs.whatsapp_e164` is non-null **and** `hasConsent('whatsapp_delivery')`
(`apps/worker/src/deliver.ts:84-86`); the same shape for email (`:63-65`). Consent is a row in `consents(user_id, purpose)`
with no address on it. `TenantDb.updatePreferences` (`packages/db/src/tenant.ts:176-191`) rewrites `whatsapp_e164` /
`email` and never touches consents; `PUT /v1/me/preferences` (`apps/api/src/app.ts:127-133`) is reachable by any device
token. The report content is attacker-controlled through `POST /v1/sync` (counterparty names up to 120 chars, notes to
500) and reaches the hero image, caption, PDF and email via the fallback writer with no model involved.

Exploit (any phone, no victim interaction): register a device → `PUT /v1/me/preferences {whatsapp_e164: <own number>}` →
send `JOIN` from own WhatsApp (or, when `WHATSAPP_APP_SECRET` is unset, forge the webhook, see M1) → consent granted →
`PUT /v1/me/preferences {whatsapp_e164: <victim>}` → `POST /v1/sync` with merchant names such as "Call 07… to claim your
KSh refund" → `POST /v1/reports/generate {kind, period:<any ISO date>, deliver:true}` → the worker sends a Hesabu-branded
hero image + caption + PDF from the business number to the victim. Repeatable per period (any week or month in history is
a fresh `(user, kind, period_start)` report, and `resetReport` does not reset deliveries, so a new period is needed per
send). The email channel has the same defect once any grant path exists (today only `seed-demo` grants
`email_delivery`; there is no magic-link flow, so email is fail-closed by omission, not by design).

Impact: Hesabu becomes an unsolicited-message relay to arbitrary numbers/addresses with phishing-capable content; spec
§11 opt-in rules and §13 "abusive delivery" are violated. In the sprint the Meta test number can only reach ≤5 verified
recipients, which caps the blast radius but not the defect.

Smallest fix: store the proven address on the consent row (`consents.address`) and have `deliverOne` require
`consent.address === prefs.whatsapp_e164` (resp. `lower(email)`); in `updatePreferences`, revoke `whatsapp_delivery`
when `whatsapp_e164` changes and `email_delivery` when `email` changes. Add the magic-link grant for email before it is
ever enabled.

### M1. Webhooks fail open when the secret is unset

`whatsappWebhook` only verifies `X-Hub-Signature-256` `if (config.whatsappAppSecret && …)` (`whatsapp-webhook.ts:43`);
`emailWebhook` likewise (`email-webhook.ts:43`). `.env.example` says "leave empty in local dev" and neither `readApiConfig`
nor the deploy manifests enforce it in production. Unsigned callers can grant/revoke `whatsapp_delivery` for any number
(`:66-80`), revoke `email_delivery` on any delivery whose `provider_message_id` they know, and flip delivery statuses
with attacker-supplied `last_error` text that the app shows (`summary.ts:38`). Fix: in `readApiConfig`, when
`NODE_ENV=production`, treat a missing `WHATSAPP_APP_SECRET`/`RESEND_WEBHOOK_SECRET` as "route disabled" (503) and always
verify when the route is enabled; use `timingSafeEqual` for the verify token (`:37`).

### M2. JOIN code ignored; number lookup is `LIMIT 1` over a non-unique column

Spec §11 says the inbound message is `JOIN <code>` and "proves number ownership". The handler accepts any text starting
with `JOIN` (`whatsapp-webhook.ts:76`) and resolves the user by `SELECT id FROM users WHERE whatsapp_e164 = … LIMIT 1`
(`system.ts:109-112`); `users.whatsapp_e164` has no unique index (`0001_init.sql:11`). Exploit: attacker sets their
`whatsapp_e164` to the victim's number before the victim JOINs; the victim's genuine JOIN lands on whichever row Postgres
returns first, so the attacker's account may receive the consent (and B1 then sends the attacker's content to the
victim) while the victim's own deliveries stay `skipped`. Fix: issue a per-user random join code, parse `JOIN <code>`,
look the user up by code and record `from` as the verified address (this also fixes B1's binding); add a unique partial
index on `whatsapp_e164`.

### M3. Device tokens never expire and cannot be revoked

`signDeviceToken` signs `{user_id, device_id, iat}` (`tokens.ts:34-38`); `verifyDeviceToken` checks only the HMAC and
field types (`:40-51`). The middleware (`app.ts:89-99`) never consults `devices`. A token copied from a stolen or
backed-up phone, a proxy log, or the `seed-demo` console output (`seed-demo.ts:47` prints it in a curl line) stays valid
for ever; the only remedy is rotating `DEVICE_TOKEN_SECRET` for every user. Fix: add `exp` (e.g. 30 days) plus
re-registration on 401 (the app already does this), and check that `devices.device_id` still exists and is not revoked;
keep a `revoked_at` on `devices`.

### M4. `device_id` is the whole credential and is stored in clear everywhere

`POST /v1/devices/register` returns a token for the user that owns `device_id` with no other proof (`app.ts:76-86`,
`system.ts:44-51`). The id is a random UUID generated on the phone (`Settings.kt:121-127`; good entropy) but it is
written in clear to `devices.device_id`, into `audit_log.actor` on every request (`app.ts:109`, `system.ts:59`), and
carried in every sync body. Anyone with read access to the database or its backups (insider, compromised backend,
leaked dump) can mint a valid token for every user through the public API. Fix: store `sha256(device_id)` and compare
hashes; use the `devices.id` row uuid (not the secret) as the audit actor; add a server-side rate limit on registration
(see M5). Document that this is "single-user sprint auth" and schedule the OTP sign-in before any beta.

### M5. No body-size limit and no rate limiting

Hono has no default body cap and the app installs neither `bodyLimit` nor a limiter (`apps/api/src/app.ts`).
`parseBody` buffers the whole JSON. `SyncRequestSchema` caps transactions at 500 but `account_ref`, `label`,
`institution`, `ref_masked`, `paybill`, `till`, `tags[]` items and `device_id` are unbounded
(`transaction.ts:46,68,75-79`). Unauthenticated `/v1/devices/register` creates a user per call; `/v1/reports/generate`
accepts any ISO date so one token can enqueue thousands of Chromium renders; `/v1/public/reports/:token` is unlimited.
Fix: `bodyLimit({ maxSize: 1_000_000 })` on `/v1/*` and webhooks, `.max()` on every string, and a per-IP/per-token
limiter (e.g. `hono-rate-limiter`) with tight limits on register, generate and the public resolver.

### M6. Artefact URLs are unsigned and permanent

`S3Storage.put` returns `${publicBase}/${key}` (`storage.ts:75-79`); keys are `reports/<user>/<report>/hero.png`
(`workflow.ts:143-148`). These URLs are stored in `artefacts` and returned by `GET /v1/reports` and by the **public**
resolver (`app.ts:218`). They only work if the bucket is world-readable, in which case the PDF with the user's full
ledger summary is fetchable for ever by anyone who ever saw the link (the signed link itself expires after 30 days;
the PDF it points to does not). The lane report's "signed expiring links" applies to `/r/<token>` only. Fix: keep the
bucket private and have the resolver return presigned GET URLs (`@aws-sdk/s3-request-presigner`, ≤15 min) minted at
request time; the app can fetch artefacts through an authenticated API route instead.

### MINOR notes (one line each; see table for locations)

- m1 `live-delivery.ts` should take a `USER_ID` and refuse otherwise; today it can mail another tenant's report to the operator.
- m2 Wire the kill switch to a DB/feature flag read per call; add a per-user daily cap (spec §9 asks for per-call, per-user and global).
- m3 Hash the body with a per-install random salt (`sha256(salt || body)`) or HMAC; parity with the TS engine needs the salt as an engine variable.
- m4 Add `res/xml/network_security_config.xml` (cleartext only for `10.0.2.2`/`localhost`), reference it from the manifest, and plan pinning for the production host.
- m5 Show a confirm sheet listing the parsed rows before `ShareReceiverActivity` ingests; mark `source=share` rows visibly in the ledger.
- m6 `timingSafeEqual` on the verify token; store only an enum for `last_error` from webhooks; ignore Meta statuses older than N minutes.
- m7 Revoke existing `report_links` rows in `resetReport`; add a revoke action in the app.
- m8 Add `permissions: contents: read` to `ci.yml`; add `gitleaks` and `pnpm audit`/`osv-scanner` jobs (spec §13).
- m9 Add `USER pwuser` (present in the Playwright image) to `Dockerfile.backend`.
- m10 Triage the 6 high advisories (`pnpm audit`); none were examined for reachability here.
- m11 Document the three variables in `.env.example`; surface `stubbed` through `PackageRenderer` and refuse delivery when true.
- m12 Add a WorkManager purge of `unknown_messages` older than 30 days and the app lock (spec §13).
- m13 Add an injection red-team set to the evals (spec §13) and consider masking digit runs inside names before the write step.
- m14 Create `docs/THREAT_MODEL.md` and map these findings to it.

Aside (not security): `SyncClient.generateReport` sends `deliver` as the string `"false"` (`SyncClient.kt:107`); the API
schema requires a boolean, so the app's "Generate this week's report" button will get a 400 against the real API.

## Checked and found sound

- **Tenancy.** Every `TenantDb` statement carries `WHERE user_id = ${this.userId}` and runs in a transaction that sets
  `app.user_id`; RLS with `FORCE` is on all 16 tables; `db.test.ts:110-131` proves rows and reports are invisible across
  users by id. API routes only touch data through `c.get('tenant')`; `GET /v1/reports/:id` and `/deliver` 404 on another
  user's id (`app.ts:177-196`). Worker jobs re-scope with `db.forUser(job.user_id).getReport(job.report_id)` and drop
  unknown reports (`workflow.ts:60-65`, `deliver.ts:35-37`). The public resolver checks signature, expiry, stored hash,
  `report_id` match and `status === 'done'` before reading through the owner's tenant handle (`app.ts:202-210`).
- **Token crypto.** HMAC-SHA256 with `timingSafeEqual`, 16-char minimum secret, base64url payloads, fail-closed 503/404
  when a secret is absent (`tokens.ts`, `env.ts`). Report links carry a per-link nonce, only the hash is stored, and the
  web app validates the token shape and never echoes it (`report-api.ts:15,30`).
- **Webhook signature implementations** are correct when enabled: Meta `sha256=` hex HMAC over the raw body; Svix
  base64 HMAC over `id.timestamp.body` with ±5 min tolerance and multi-signature support; both constant-time.
- **AI safety rails.** `redact()` masks emails, Kenyan phones, M-Pesa codes and 7+ digit runs while keeping amounts;
  the API re-redacts server-side (`extractor.ts:22`). `dataBlock` neutralises `</data>`; every system prompt carries
  the data-not-instructions rules; all calls use Zod structured output; identity fields and drill-downs are set by code
  (`write.ts:193-222`); insight ids and chart ids are validated against the engine's lists; the deterministic
  fact-checker rejects any numeral not in `display_strings`; the pipeline falls back to the template writer on any
  failure; no tools, no side effects from output. Cost ledger stores step/model/counts only; model errors are mapped to
  short PII-free strings; the API key is read from env and never logged. Budget: global daily cap checked before every
  call, `AI_ENABLED` must be exactly `"true"`, malformed cap → 0.
- **Android.** `allowBackup="false"`; SQLCipher passphrase is 32 random bytes in `EncryptedSharedPreferences` under a
  Keystore master key; unknown bodies additionally AES-256-GCM encrypted with a non-exportable Keystore key; device
  token in `EncryptedSharedPreferences`. `SmsReceiver` is guarded by `android.permission.BROADCAST_SMS`, filters the
  sender before reading the body, never aborts the broadcast. `InboxReader` puts the sender allow-list in the SQL
  selection (`LOWER(TRIM(address)) IN (...)`). Logs are counts and exception class names only; wire DTOs have no body
  field; the artefact downloader sends the token only to the configured host and does not follow redirects when it
  does; FileProvider exposes `cache/reports/` only; 15 MB download cap. Packs load from APK assets only.
- **Secrets hygiene.** `.env` ignored, only `.env.example` tracked; no `sk-ant-`, `EAAG`, `whsec_`, AWS or private-key
  patterns in the tree or in history (`git log -S`); compose/CI credentials are dev-only; `render.yaml`/`fly.toml`
  keep secrets out of the repo; corpus phone numbers are synthetic.
- **Renderer/web.** All document strings pass through React `renderToStaticMarkup` or `escapeHtml`; no
  `dangerouslySetInnerHTML`; `/r/[token]` is `noindex` and fails closed on validation.

## Commands and scanners

- Read: `apps/api/src/**`, `apps/worker/src/**`, `apps/worker/scripts/live-delivery.ts`, `packages/db/src/**`,
  `packages/db/migrations/*.sql`, `packages/agents/src/**`, `packages/analytics/src/contracts/transaction.ts`,
  `packages/renderer/src/{render,html}.ts`, `apps/web/{app/r/[token]/page.tsx,lib/report-api.ts,next.config.ts}`,
  `android/app/src/main/AndroidManifest.xml` and the data/ingest/sync/reports Kotlin sources, `infra/**`,
  `.github/workflows/ci.yml`, `.env.example`, `.gitignore`.
- `git log --oneline`, `git ls-files`, `git log --all -p -S"sk-ant-"`, `git log --all -p -S"whsec_"` (read-only).
- `grep` for `Log.`/`println`/`Timber` (Android), `console.*` (backend), secret patterns, `bodyLimit`/rate-limit,
  `grantConsent`/`hasConsent`, `dangerouslySetInnerHTML`.
- `pnpm audit --audit-level=high`: 15 advisories (6 high, 9 moderate). Note: this command reached the npm registry
  through the preconfigured proxy despite the no-network instruction; it was run once and not repeated.
- Not available in this container: `gitleaks`, `trivy`, `osv-scanner`, `codeql`, `pip-audit`, `semgrep`. The test
  suite was not executed (it writes snapshots/screenshots; the review was read-only).
