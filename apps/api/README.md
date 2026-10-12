# @hesabu/api

**Owner:** Lane B (backend and agents). **Purpose:** the HTTP API, Hono on Node (`@hono/node-server`):
single-user device-token auth, sync, report generation and delivery endpoints, Resend and WhatsApp webhooks.
The OpenAPI contract is frozen in `contracts/`.

Scaffolded during the 24-hour sprint; only `GET /health` exists.

## Run

- `pnpm dev` — `tsx watch src/index.ts` on `PORT` (default 3001).
- `pnpm build && pnpm start` — compiled `dist/index.js`.
- `pnpm test` — Vitest; routes are tested in-process with `app.request()` (no sockets, no providers).

## Conventions

- `src/app.ts` builds the Hono app (`createApp()`), `src/index.ts` is the Node entry that serves it.
- Every secret is read from the environment and the process fails closed when one is missing (see `.env.example`).
- Tests never reach a real LLM, email, WhatsApp or payment provider: fake every provider.
