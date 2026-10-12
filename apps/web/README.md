# @hesabu/web

**Owner:** Lane C. **Purpose:** the Next.js 15 (App Router) web viewer for signed report links, in the ruled-ledger
design from `docs/DESIGN_BRIEF.md`.

## Routes

- `/r/[token]` resolves `GET {API_BASE_URL}/v1/public/reports/{token}`, validates both documents against the frozen
  contracts (`@hesabu/report-model`) and renders the report. Unknown or expired links are a 404; a missing
  `API_BASE_URL` or a failing API is an honest error page (fail closed). The token is never logged or echoed.
- `/dev/report?fixture=weekly-en&theme=dark` renders a fixture without an API (`weekly-en`, `weekly-sw`,
  `monthly-en`, `monthly-sw`; `theme` light or dark, omit it for the system preference). On outside production,
  or when `HESABU_DEV_ROUTES=1`.

## Design

The report page (`ReportPage`, `reportStyles`) and the charts live in `@hesabu/charts`, so the renderer produces the
same markup for PDF and email. The layout inlines one stylesheet (theme variables, chart frames, ledger) and serves
Schibsted Grotesk from `public/fonts/` (OFL, Latin subset, variable weight). 360 px and 1440 px layouts; the
reading column is 720 px; charts are laid out twice (328 and 672) and the stylesheet shows one per viewport. Print
stylesheet for A4.

## Commands

- `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm test`, `pnpm lint`, `pnpm typecheck` as everywhere.
- `pnpm screenshots` (after `pnpm build`): Playwright screenshots of every fixture at 360 and 1440 in both themes
  into `screenshots/`, plus an axe pass (WCAG 2.1 AA and best practice) that fails on any violation.
- `pnpm lighthouse` (after `pnpm build`): Lighthouse mobile profile on the weekly and monthly fixtures, scores in
  `screenshots/lighthouse.json`. Last run: accessibility 100, performance 93 (weekly) and 97 (monthly).

Both scripts need Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` in the sprint environment; never run
`playwright install` there).
