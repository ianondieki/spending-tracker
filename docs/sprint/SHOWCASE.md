# Showcase script (ten minutes, three layers of fallback)

Layers, best first. Decide the layer in the pre-flight hour and keep the next one open in a tab.

| Layer | What runs | Needs |
|---|---|---|
| **A. Live** | The app on the owner's phone with real M-Pesa messages, syncing to the stack; a real report delivered to the owner's email and WhatsApp | Phone with the APK and SMS consent granted; stack reachable from the phone (deployed, or laptop + tunnel); Resend and Meta secrets |
| **B. Demo mode** | Demo mode on the phone (the synthetic inbox through the real on-device pipeline) plus the live stack on a laptop behind a tunnel; fake or real deliveries | Laptop with Postgres, Node 22, Chromium; `cloudflared` or `ngrok`; the phone on the same network or the tunnel URL |
| **C. Committed** | `docs/sprint/samples/` (hero, charts, PDF, email), the web fixtures at `/dev/report`, the Android screenshots under `android/screenshots/`, the web screenshots under `apps/web/screenshots/`, and any recordings under `docs/sprint/showcase/` | A browser and the repo checkout; nothing else |

## Pre-flight (the hour before)

- [ ] `git pull`, `pnpm install --frozen-lockfile`, `pnpm -r build` on the laptop; `make check-backend` green.
- [ ] Postgres up (`make dev`), `.env` filled: `DEVICE_TOKEN_SECRET`, `REPORT_LINK_SECRET`, and for layer A the
      Resend and Meta values plus `REPORT_TO_EMAIL` / `REPORT_TO_WHATSAPP` (`set -a; . ./.env; set +a`).
- [ ] `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:web` running; `curl -s localhost:8787/health` says `ok` with `db: true`.
- [ ] Tunnel up: `cloudflared tunnel --url http://localhost:8787` (API) and a second for `:3000` (web); the API URL
      pasted into the phone's Settings; `APP_BASE_URL` set to the web tunnel and the worker restarted.
- [ ] Phone: APK installed, battery > 50 %, notifications on, Settings → server URL saved, SMS consent granted
      (layer A) or demo mode on (layer B); airplane mode off; auto-brightness off.
- [ ] Seed once so the Reports screen is not empty: `make seed-demo` (prints the two web links; open both once).
- [ ] Layer A only: `USER_ID=<owner uuid> DRY_RUN=1 pnpm --filter @hesabu/worker live-delivery` prints the report that will go out.
- [ ] Layer A only: the owner has sent `JOIN <code>` (code in the app's Settings) from their WhatsApp and confirmed the
      email magic link; Settings shows both addresses as verified. Without that, deliveries are skipped by design.
- [ ] Layer C open in browser tabs: `docs/sprint/samples/weekly-en-light/hero.png`, `.../report.pdf`,
      `http://localhost:3000/dev/report?fixture=monthly-en&theme=dark`, `android/screenshots/`.
- [ ] Mailpit (`http://localhost:8025`) open for layer B so a fake-free local email is visible if Resend is off.

## The ten minutes

Each step: **show** · *say (one line)* · **if it fails**.

1. **The problem (0:00–0:45).** Show a real M-Pesa SMS thread on the phone. *"Every shilling you move already arrives
   as a text message; nobody adds them up."* Fails: show the demo inbox file `corpus/demo/demo-inbox.jsonl` instead.

2. **Permission and parsing (0:45–2:00).** Home screen with this week's tally and the day rows filling as messages
   are parsed (layer A: real; layer B: Settings → Demo mode on). *"Parsing happens on the phone; the message text
   never leaves it. The server only ever sees amounts, dates and masked names."* Fails: Transactions screen from
   `android/screenshots/`; the sync test that asserts no body text reaches the wire is in the Android report.

3. **Teach Hesabu (2:00–2:45).** Open one unknown message, tap "money out" with the suggested amount. *"When a
   format is new, the user teaches it in one tap; no raw text goes to a model unless they opt in."* Fails: skip;
   mention the AI consent is off by default.

4. **Generate a report (2:45–4:30).** Reports → "Generate this week's report" on the phone, or on the laptop:
   ```sh
   curl -s -X POST localhost:8787/v1/reports/generate -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"kind":"weekly","period":"2026-10-07","deliver":true}'
   ```
   Show the worker log lines: collect → write (fallback or model) → render → deliver. *"Every number is computed from
   the ledger; the writer may only quote numbers that exist in the facts sheet, and a checker rejects anything else."*
   Fails: `make seed-demo` already produced two finished reports; open them from the Reports list.

5. **The report, four ways (4:30–6:30).** Hero image on the phone (share sheet → WhatsApp), the web link from the
   summary (`/r/<token>`), the PDF, the email in Mailpit or the owner's inbox. *"One report model, rendered for
   WhatsApp, email, web and the app; dark and light; English and Kiswahili."* Fails: layer C tabs:
   `docs/sprint/samples/weekly-en-light/hero.png`, `monthly-sw-dark/hero.png`, `report.pdf`,
   `localhost:3000/dev/report?fixture=weekly-sw`.

6. **Kiswahili and the numbers-only guarantee (6:30–7:30).** Settings → language → Kiswahili, re-open the report.
   Point at `meta.writer` in the API response (`fallback` or `model`) and `fact_check.passed`. *"With AI off the report
   still goes out, written from templates; with AI on, the same checker stands between the model and the user."*
   Fails: `docs/sprint/samples/weekly-sw-light/document.json` shows the same fields.

7. **Real delivery (7:30–8:45, layer A only).**
   ```sh
   USER_ID=<owner uuid> pnpm --filter @hesabu/worker live-delivery   # the owner's latest weekly report to REPORT_TO_EMAIL and REPORT_TO_WHATSAPP
   ```
   Show the WhatsApp image with caption and the PDF arriving on the owner's phone, then the email. *"Delivered where
   people already look; the webhooks update the status to delivered and read."* Fails: layer B fake deliveries show
   `email: sent` / `whatsapp: sent` in the report summary (`GET /v1/reports`), and Mailpit holds the email if
   `RESEND_API_KEY` is empty and the SMTP fake is pointed at it; otherwise show the committed `email.html`.

8. **Trust and limits (8:45–9:30).** Footer line "Every number here is computed from your transaction messages on
   your phone. Nothing was guessed." and the fee callout. *"Transfers are not spending, fees are first-class, cash is
   cash; what we do not know we say."* Fails: nothing to fail; read it from the sample.

9. **Close (9:30–10:00).** The weekly schedule (Sunday 19:30) in Settings and `next_report_at` in the sync response.
   *"Next Sunday evening it arrives by itself."*

## If the whole live stack dies

Switch to layer C without apology: the committed samples were produced by the same pipeline from the same demo
inbox, the fixtures at `/dev/report` are the renderer's own output, and the Android screenshots are recorded by the
test suite on every run. Say so.

## Commands in one place

From `docs/sprint/DEMO-RUNBOOK.md`: `make dev` · `pnpm -r build` · `pnpm dev:api` · `pnpm dev:worker` · `pnpm dev:web`
· `make seed-demo` (or `RESEED=1 make seed-demo`) · `pnpm --filter @hesabu/worker samples` ·
`DRY_RUN=1 pnpm --filter @hesabu/worker live-delivery` · `pnpm --filter @hesabu/worker live-delivery` ·
`pnpm --filter @hesabu/agents build && pnpm --filter @hesabu/agents try:model` (live model, needs `ANTHROPIC_API_KEY`
and `AI_ENABLED=true`). Tunnels: `cloudflared tunnel --url http://localhost:8787` and `... :3000`, or `ngrok http 8787`.
Deployment paths, if the stack should live in the cloud instead: `infra/deploy/README.md`.
