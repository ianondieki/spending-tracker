# @hesabu/api

Hono on Node. Implements every path in `contracts/openapi.yaml` (sprint v1): single-user device-token auth,
sync, preferences, reports, deliveries, public signed links, provider webhooks, health.

## Run it

```sh
cp .env.example .env            # fill DEVICE_TOKEN_SECRET and REPORT_LINK_SECRET (openssl rand -hex 32)
make dev                        # Postgres 16, Mailpit, MinIO; applies migrations
pnpm dev:api                    # http://localhost:8787
pnpm dev:worker                 # in a second terminal: the report workflow, scheduler and deliveries
```

The API fails closed: without `DEVICE_TOKEN_SECRET` registration and every authenticated route answer `503`;
without `REPORT_LINK_SECRET` every public link is `404`; without `WHATSAPP_VERIFY_TOKEN` the Meta handshake is `503`.

## curl walkthrough

```sh
API=http://localhost:8787

# 1. Health
curl -s $API/health

# 2. Register this device and keep the token (the sprint's single-user auth)
TOKEN=$(curl -s -X POST $API/v1/devices/register -H 'content-type: application/json' \
  -d '{"device_id":"laptop-1","platform":"android","app_version":"1.0.0","display_name":"Demo"}' | jq -r .device_token)

# 3. Sync accounts and transactions (bodies are contracts/transaction.schema.json#SyncRequest)
curl -s -X POST $API/v1/sync -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d @- <<'JSON'
{"device_id":"laptop-1","app_version":"1.0.0","parser_version":"1.0.0",
 "accounts":[{"account_ref":"mpesa:07XXXXX321","provider":"mpesa","institution":"Safaricom","label":"M-Pesa","mask":"07XXXXX321"}],
 "transactions":[{"id":"11111111-1111-4111-8111-111111111111","account_ref":"mpesa:07XXXXX321","provider":"mpesa",
   "external_ref":"RJK3H5T2QW","type":"BUY_GOODS","direction":"out","amount_cents":345000,"fee_cents":0,
   "balance_after_cents":1000000,"occurred_at":"2026-10-06T18:12:00+03:00","received_at":"2026-10-06T18:12:05+03:00",
   "counterparty":{"kind":"till","name":"NAIVAS SUPERMARKET","till":"834501"},"category_id":"groceries",
   "category_source":"merchant","category_confidence":0.9,"is_transfer":false,"parse_confidence":0.99,"source":"sms",
   "raw_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
   "parser":{"pack_id":"mpesa","pack_version":"1.0.0","family_id":"buy_goods"},"user_edited":false,
   "updated_at":"2026-10-06T18:12:05+03:00"}],
 "unknown_message_count":0,"sent_at":"2026-10-06T18:13:00+03:00"}
JSON

# 4. Preferences (where reports go; channels email|whatsapp|share)
curl -s -X PUT $API/v1/me/preferences -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"email":"you@example.com","locale":"en","channels":["email","share"],"weekly_at":"SUN 19:30"}'

# 5. Generate last week's report (202; the worker runs collect → write → check → render → deliver)
REPORT=$(curl -s -X POST $API/v1/reports/generate -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"weekly","period":"last_week","deliver":true}')
ID=$(echo "$REPORT" | jq -r .report_id)

# 6. Poll until status is done, then fetch the document and facts
curl -s $API/v1/reports -H "authorization: Bearer $TOKEN" | jq '.[0].status'
curl -s $API/v1/reports/$ID -H "authorization: Bearer $TOKEN" | jq '.summary, .document.title, .facts.totals.out'

# 7. Deliver again on demand (idempotent per channel; already-sent channels are left alone)
curl -s -X POST $API/v1/reports/$ID/deliver -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"channels":["email"]}'

# 8. Open the signed web link printed in artefacts.web_url (the API resolves it for apps/web)
curl -s $API/v1/public/reports/<token> | jq .document.title
```

Report `period` accepts `last_week`, `last_month`, `current` or an ISO date inside the period. Generation is
idempotent on (user, kind, period_start); pass `"force": true` to regenerate a finished report.

## Webhooks

- `GET /webhooks/whatsapp` answers Meta's verification handshake when `hub.verify_token` equals `WHATSAPP_VERIFY_TOKEN`.
- `POST /webhooks/whatsapp` updates deliveries from status events (`sent`, `delivered`, `read`, `failed`) and handles
  inbound `JOIN` (grants the `whatsapp_delivery` consent) and `STOP` (revokes it). When `WHATSAPP_APP_SECRET` is set the
  `X-Hub-Signature-256` header is verified.
- `POST /webhooks/email` maps Resend events (`email.delivered`, `email.bounced`, `email.complained`, …) onto
  deliveries; bounces and complaints revoke the `email_delivery` consent. When `RESEND_WEBHOOK_SECRET` is set the
  Svix signature headers are verified.

## Tests

`pnpm --filter @hesabu/api test` runs the HTTP suite against `DATABASE_URL` (default
`postgres://hesabu:hesabu@localhost:5432/hesabu`), plus an ajv cross-check of the Zod mirrors against the frozen
JSON schemas in `contracts/` and the Nairobi schedule arithmetic. Without a reachable database the Postgres suite is
skipped locally and fails in CI.
