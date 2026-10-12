# Deployment readiness (nothing here has been run)

Two hosting paths are prepared, neither executed and no vendor account created during the sprint. Both use the same
two images: `Dockerfile.backend` (API and worker, built on the Playwright image so the renderer has Chromium) and
`Dockerfile.web` (the Next.js viewer). The images are **unbuilt and untested** in the sprint container (no Docker
daemon); build them once locally before trusting either path:

```sh
docker build -f infra/deploy/Dockerfile.backend -t hesabu-backend .
docker build -f infra/deploy/Dockerfile.web -t hesabu-web .
docker run --rm -e DATABASE_URL=... -e DEVICE_TOKEN_SECRET=... -p 8787:8787 hesabu-backend   # /health
```

## Path A: Fly.io (region `jnb`, closest to Nairobi)

- `fly.toml`: app `hesabu-backend`, processes `api` (public, `/health` check, never auto-stopped so webhooks and
  the five-minute scheduler keep running) and `worker` (2 GB for Chromium). Postgres: `fly postgres create` +
  `fly postgres attach` sets `DATABASE_URL`; an external Postgres works the same by setting the secret yourself.
- `fly.web.toml`: app `hesabu-web`, scales to zero, needs `API_BASE_URL`.
- Object storage: Tigris (`fly storage create`) sets `AWS_*` variables; map them to `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY` (all four or none). Without S3 the worker writes to the machine's disk, which is
  fine for a demo and lost on redeploy.

```sh
fly launch --no-deploy --copy-config --config infra/deploy/fly.toml
fly postgres create --name hesabu-db --region jnb && fly postgres attach hesabu-db --app hesabu-backend
fly secrets set --app hesabu-backend DEVICE_TOKEN_SECRET=$(openssl rand -hex 32) REPORT_LINK_SECRET=$(openssl rand -hex 32) \
  WHATSAPP_VERIFY_TOKEN=$(openssl rand -hex 16) APP_BASE_URL=https://hesabu-web.fly.dev
fly deploy --config infra/deploy/fly.toml
fly launch --no-deploy --copy-config --config infra/deploy/fly.web.toml
fly secrets set --app hesabu-web API_BASE_URL=https://hesabu-backend.fly.dev
fly deploy --config infra/deploy/fly.web.toml
```

## Path B: Render (blueprint)

`render.yaml`: `hesabu-api` (web service, Docker, `/health`), `hesabu-worker` (background worker, same image,
`standard` plan for Chromium), `hesabu-web`, and the `hesabu-db` Postgres. Render has no African region; `frankfurt`
is the closest. Apply with New → Blueprint, then fill every `sync: false` variable in the dashboard.

## Secrets and variables (names only; values never in the repo; see `.env.example` for each one's meaning)

| Service | Required | Optional |
|---|---|---|
| api | `DATABASE_URL`, `DEVICE_TOKEN_SECRET`, `REPORT_LINK_SECRET`, `APP_BASE_URL` | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `RESEND_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY` + `AI_ENABLED` (extraction) |
| worker | `DATABASE_URL`, `REPORT_LINK_SECRET`, `APP_BASE_URL` | `RESEND_API_KEY`, `RESEND_FROM`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `S3_*` (all four), `S3_PUBLIC_BASE_URL`, `ANTHROPIC_API_KEY` + `AI_ENABLED` + `AI_DAILY_BUDGET_USD`, `REPORT_LINK_TTL_DAYS` |
| web | `API_BASE_URL` | `HESABU_DEV_ROUTES=1` (fixtures at `/dev/report` outside development) |

Everything fails closed: a missing required secret stops the service or answers 503; a missing optional provider
means the fake (non-production) or `skipped` deliveries (production). `NODE_ENV=production` disables the fakes.

## One-time steps after the first deploy

1. **Migrations** run automatically when the API or worker starts (`Db.open` applies `packages/db/migrations`);
   `pnpm --filter @hesabu/db migrate` does the same by hand against `DATABASE_URL`.
2. **Seed** (optional, demo persona): `DATABASE_URL=<prod> DEVICE_TOKEN_SECRET=<prod> API_URL=https://<api> \
   pnpm --filter @hesabu/db seed:demo` from a laptop (`pnpm -r build` first). Use `RESEED=1` to refresh.
3. **Phone**: Settings → server URL = `https://<api>`; the app registers itself and syncs.
4. **WhatsApp webhook** (Meta developer app → WhatsApp → Configuration): callback URL `https://<api>/webhooks/whatsapp`,
   verify token = the API's `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`; set `WHATSAPP_APP_SECRET` to the app
   secret so signatures are checked. Add the owner's number as a test recipient; the owner sends `JOIN` to the test
   number once (grants the `whatsapp_delivery` consent).
5. **Resend webhook** (Resend → Webhooks): `https://<api>/webhooks/email` for `email.delivered`, `email.bounced`,
   `email.complained`; copy the signing secret into `RESEND_WEBHOOK_SECRET`.
6. **Smoke**: `curl https://<api>/health`, then the curl walkthrough in `apps/api/README.md`.

## Laptop + tunnel (the showcase fallback)

No cloud at all: run the stack locally and expose the API and web ports with a tunnel so the phone, Meta and Resend
can reach them.

```sh
make dev && pnpm -r build && pnpm dev:api & pnpm dev:worker & pnpm dev:web &
cloudflared tunnel --url http://localhost:8787      # prints https://<random>.trycloudflare.com for the API
cloudflared tunnel --url http://localhost:3000      # a second one for the web viewer (or ngrok http 8787 / ngrok http 3000)
```

Put the API tunnel URL in the phone's Settings and in the Meta and Resend webhook configuration; put the web tunnel
URL in `APP_BASE_URL` (restart the worker so new report links use it) and the API URL in the web app's
`API_BASE_URL`. Quick tunnels change their hostname on every start: regenerate links (`force: true`) after a restart.
