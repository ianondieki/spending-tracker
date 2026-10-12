# Demo runbook (Lane B)

From a clean clone to a generated, rendered and delivered report. Everything below is deterministic and needs no
secrets except where marked. Times are Africa/Nairobi; the demo inbox covers Monday 17 August to Sunday 11 October 2026.

## 0. Prerequisites

- Node 22 (`.nvmrc`), pnpm 10 (`corepack enable`), Docker with Compose (for Postgres, Mailpit and MinIO), Chromium
  for the renderer (Playwright's own: `pnpm --filter @hesabu/renderer exec playwright install chromium`, or set
  `HESABU_CHROMIUM_PATH`).
- `cp .env.example .env`, then set `DEVICE_TOKEN_SECRET` and `REPORT_LINK_SECRET` (`openssl rand -hex 32` each).
  Leave every provider key empty: the worker uses the fakes and the numbers-only writer.

```sh
pnpm install --frozen-lockfile
pnpm -r build                      # workspace packages resolve to dist/ at runtime (scripts, dev servers)
make dev                           # postgres:5432, mailpit:8025, minio:9000; applies migrations
```

## 1. Seed the demo ledger and generate the reports

Run the API and the worker in two terminals, then the seed:

```sh
set -a; . ./.env; set +a
pnpm dev:api                       # http://localhost:8787
pnpm dev:worker                    # in another terminal (same env)
make seed-demo                     # third terminal (same env)
```

`seed:demo` parses `corpus/demo/demo-inbox.jsonl` with `@hesabu/pack-engine` (82 messages, 81 transactions after
dedupe, 3 transfer pairs, 0 balance breaks), categorises with `@hesabu/taxonomy`, registers the demo device and user,
grants the delivery consents, sets budgets, then asks the API to generate the week of 5–11 October 2026 and the
month of September 2026 with delivery, and polls until both are `done`. The last lines print the signed web links.

Without the API running, the script seeds and prints the two `curl` commands to run later.

Equivalent by hand (token from `POST /v1/devices/register`):

```sh
curl -s -X POST localhost:8787/v1/reports/generate -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"weekly","period":"2026-10-07","deliver":true}'
curl -s -X POST localhost:8787/v1/reports/generate -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"monthly","period":"2026-09-15","deliver":true}'
curl -s localhost:8787/v1/reports -H "authorization: Bearer $TOKEN" | jq '.[] | {kind, status, writer, web_url: .artefacts.web_url, deliveries}'
```

## 2. See the result

- **Web report:** open the `web_url` from the summary (`http://localhost:3000/r/<token>`; `pnpm dev:web` serves it,
  and `GET /v1/public/reports/<token>` on the API returns the document and facts behind it). The link is signed and
  expires after `REPORT_LINK_TTL_DAYS` (30).
- **Artefacts:** with no S3 configured they are under `.hesabu-storage/reports/<user>/<report>/` (hero.png, charts/,
  report.pdf, web.html, email.html, email.txt). With `make dev` MinIO is up but unused until the `S3_*` variables are
  set; then they land in the `hesabu` bucket (console on http://localhost:9001).
- **Fake deliveries:** `deliveries` in the report summary shows `email: sent` and `whatsapp: sent` with
  `fake-email-1` / `wamid.fake-…` ids. Nothing left the machine.
- **Committed samples:** `docs/sprint/samples/<weekly|monthly>-<en|sw>-<light|dark>/` were produced by
  `pnpm --filter @hesabu/worker samples` from the same path (real renderer, chart PNGs downscaled to 1×).

## 3. Run the checks

```sh
make check-backend                 # lint, typecheck, test, build for Lane B and Lane D packages
pnpm --filter @hesabu/worker test  # includes the end-to-end demo path and the real-renderer test (skips without Chromium)
```

The Postgres suites skip with a warning when `DATABASE_URL` is unset; CI always sets it.

## 4. Send a real email and a real WhatsApp message (once secrets exist)

Prerequisites: a Resend API key (the default `onboarding@resend.dev` sender works without domain verification), a
Meta developer app with the WhatsApp product, its temporary access token and the test number's phone-number id, and
the owner's number added as a verified recipient of that test number. Put them in `.env`:

```
RESEND_API_KEY=re_...
RESEND_FROM="Hesabu <onboarding@resend.dev>"
WHATSAPP_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=1234567890
REPORT_TO_EMAIL=owner@example.com
REPORT_TO_WHATSAPP=+2547XXXXXXXX
USER_ID=<the owner's account uuid, printed by make seed-demo>
```

Then, with at least one finished weekly report in the database:

```sh
set -a; . ./.env; set +a
DRY_RUN=1 pnpm --filter @hesabu/worker live-delivery     # prints what would go where, sends nothing (needs USER_ID too)
pnpm --filter @hesabu/worker live-delivery               # sends the latest weekly report to the owner only
CHANNELS=email pnpm --filter @hesabu/worker live-delivery
```

The script refuses to run unless all seven variables are present, reads only the `USER_ID` account's reports and only
ever addresses `REPORT_TO_EMAIL` and `REPORT_TO_WHATSAPP`. It records an audit row per send. Delivery status webhooks (`/webhooks/email`,
`/webhooks/whatsapp`) need a public URL (a tunnel to the API) configured at Resend and Meta; `WHATSAPP_VERIFY_TOKEN`
answers Meta's verification handshake.

For the normal path (the worker delivering to the user's own preferences), set the same provider secrets, make sure
the user's preferences carry an email and a number, the `email_delivery` and `whatsapp_delivery` consents are granted
(the seed grants them for the demo user; in the product the WhatsApp one comes from the `JOIN <code>` message and the
email one from the magic link sent by `POST /v1/me/email/send-link`), and call
`POST /v1/reports/<id>/deliver` or generate with `"deliver": true`.

## 5. Write with the live model

```sh
set -a; . ./.env; set +a                        # ANTHROPIC_API_KEY, AI_ENABLED=true, AI_DAILY_BUDGET_USD=2
pnpm --filter @hesabu/agents build && pnpm --filter @hesabu/agents try:model     # one sample sheet; prints usage and cost
```

With the same variables in the worker's environment, every generated report goes through insight-select → write →
fact-check (one regenerate) before falling back to the numbers-only writer; `reports.writer` says which one produced
it and `ai_usage` records every call. The daily cap is global across users and the kill switch lives in
`BudgetGuard`.
