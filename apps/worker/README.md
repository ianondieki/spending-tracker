# @hesabu/worker

Background worker on pg-boss (Postgres): the report workflow, the Africa/Nairobi scheduler and deliveries.

```
collect → insight-select → write → check → render → deliver
```

- **collect** pulls the transaction window (six months back or from 1 January, whichever is earlier, to the period
  end) and computes the `FactsSheet` with `@hesabu/analytics`. No model.
- **insight-select / write / check** run inside `@hesabu/agents`: the model ranks candidate insights and writes the
  `ReportDocument` under structured output; the deterministic fact-checker rejects any number that is not a display
  string from the sheet; one regenerate, then the numbers-only fallback writer. `AI_ENABLED=true` plus
  `ANTHROPIC_API_KEY` plus headroom under `AI_DAILY_BUDGET_USD` are all required for a model call.
- **render** goes through the renderer boundary (`contracts/renderer-interface.md`). `PackageRenderer` loads
  `@hesabu/renderer` lazily and fills whatever the current placeholder does not return from the stub (1×1 PNG, one-page
  PDF, minimal HTML), so delivery works end to end before Lane C lands.
- Artefacts (hero PNG, chart PNGs, PDF, web HTML, email HTML and text) go to S3-compatible storage (MinIO locally) or,
  when S3 is not configured, a local folder (`STORAGE_DIR`, default `.hesabu-storage`). A signed, expiring report link
  (`REPORT_LINK_SECRET`, `REPORT_LINK_TTL_DAYS`) is created and its hash stored for revocation.
- **deliver** is one job per (report, channel), idempotent: a delivery already `sent`, `delivered` or `read` is never
  sent again. Email needs an address and the `email_delivery` consent; WhatsApp needs a number and the
  `whatsapp_delivery` consent (the user's `JOIN` message). Missing provider secrets mark the delivery `skipped`.
  Provider message ids are stored so the API's webhooks can update the status.

## Scheduler

Every five minutes the worker walks all users. A `weekly_at` slot ("SUN 19:30") or `monthly_at` slot ("1 07:30")
that fired in the last 36 hours queues the report for the period ending within 12 hours of the slot (Sunday evening
reports the week ending that night), otherwise the previous period. Report rows are unique on (user, kind,
period_start), so a tick can run as often as it likes.

## Adapters and fakes

| Service | Real | Fake | Switch |
|---|---|---|---|
| Storage | `S3Storage` (`@aws-sdk/client-s3`, path-style) | `FsStorage`, `MemoryStorage` | all four `S3_*` variables set; a partial set refuses to start |
| Email | `ResendEmailSender` (inline `cid:` images, PDF attached) | `FakeEmailSender` | `RESEND_API_KEY` |
| WhatsApp | `CloudApiWhatsAppSender` (upload media, image + caption, document; template path stubbed) | `FakeWhatsAppSender` | `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` |
| Model | `AnthropicModelClient` | `FakeModelClient` | `AI_ENABLED=true` + `ANTHROPIC_API_KEY` |

In production (`NODE_ENV=production`) a missing provider means `null`, never a fake.

## Run and test

```sh
pnpm dev:worker                       # needs DATABASE_URL; see .env.example
pnpm --filter @hesabu/worker test     # adapters, scheduler, and the end-to-end workflow against DATABASE_URL
```

The end-to-end test registers a demo user through the in-process API, syncs the demo ledger, generates last week's
and last month's reports with the fallback writer, delivers them through the fakes, and checks idempotency, the
signed link, forced regeneration, failure marking and the scheduler.
