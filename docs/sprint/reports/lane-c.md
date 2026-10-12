# Lane C report: charts, renderer, web viewer, email

Branch `claude/beautiful-pascal-w5oxu3-lane-c`, from 13:33 UTC on 12 October 2026. All five kickoff items shipped
in order, then the orchestrator's second package (audit, 25 % hero review, PDF smoke test, sample review);
`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` are green from the repo root.

## What shipped

| Package | What | Tests |
|---|---|---|
| `packages/report-model` | Types generated from the two frozen schemas (`pnpm gen`, test fails when stale), ajv validators that fail closed, the one KSh formatter, a fixture builder that computes every derived number, weekly (5 to 11 Oct 2026) and monthly (Sep 2026) FactsSheets with ReportDocuments in en and sw, the same as JSON in `fixtures/` for Kotlin and Lane B | 44 |
| `packages/charts` | The ten chart types as deterministic React SVG, tokens as CSS variables, light and dark, en and sw, alt text and a data-table twin on every chart, `resolveChart(section, facts)`; plus `ReportPage` and `reportStyles`, the ruled-ledger report page shared by the web viewer and the renderer; Schibsted Grotesk (OFL, Latin woff2) in `fonts/` | 96 (snapshot per chart section per fixture per theme) |
| `apps/web` | `/r/[token]` against `GET /v1/public/reports/{token}` (validated, fail closed, token never echoed), `/dev/report?fixture=&theme=`, 360 and 1440 layouts, print stylesheet, both themes; 16 screenshots in `apps/web/screenshots/`; axe clean (WCAG 2.1 AA + best practice); Lighthouse mobile (`apps/web/screenshots/lighthouse.json`): accessibility 100, performance 98, best practices 96 to 100 on both fixtures | 10 |
| `packages/renderer` | `renderReport()` per the interface: standalone web HTML with embedded fonts, hero PNG 1080×1350, chart PNGs 1200 px at 2× DPR, A4 PDF from the print stylesheet, table-based email with `cid:` images and a plain-text twin; golden heroes for weekly en and monthly sw in both themes in `golden/`; an A4 smoke test (pdf.js) asserting page count, key copy and no text past the page or the right margin on every fixture | 23 (browser tests skip without Chromium) |

Design decisions worth knowing:

- **Figures are proportional, not tabular.** Schibsted Grotesk's `tnum` widens the comma too, so `KSh 2,840`
  rendered as `KSh 2 , 840`. Amounts right-align in one numeral column instead, which gives the ledger alignment the
  brief wants. This is the one deliberate deviation from `docs/DESIGN_BRIEF.md`.
- **The contract's six-step categorical ramp fails the dataviz validator** (monochrome by design). Kept as the
  brief says; every chart carries direct labels, 2 px surface gaps and a data table so identity never rests on colour.
  Request logged in `docs/sprint/CONTRACT-REQUESTS.md`.
- **Legends only above three series** (chart spec): in/out bars are named under each bar; trend lines are named at
  their ends with a short key stroke.
- **Charts are laid out twice** (328 and 672 px) in the web page and the stylesheet shows one per viewport, so phone
  labels stay 12 to 14 px instead of scaling down. The hidden copy is `display: none`, so assistive tech sees one chart.
- **Renderer fails closed** without Chromium (`RendererUnavailableError`) unless `HESABU_RENDERER_ALLOW_STUB=1`,
  which returns the real HTML and text with a 1×1 PNG and a one-page PDF, marked `stubbed: true`.

## How to run

```sh
pnpm install
pnpm --filter @hesabu/report-model --filter @hesabu/charts --filter @hesabu/renderer --filter @hesabu/web test
pnpm --filter @hesabu/web build && pnpm --filter @hesabu/web screenshots   # 16 PNGs + axe
pnpm --filter @hesabu/web lighthouse                                        # mobile profile scores
pnpm --filter @hesabu/renderer golden                                       # rewrite golden heroes after a design change
pnpm --filter @hesabu/web dev   # then open /dev/report?fixture=monthly-sw&theme=dark
```

Chromium: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` in the sprint container (Playwright pinned to 1.56.1 to match
it); never run `playwright install` there.

## For the orchestrator and Lane B

- CI has no browser. Renderer golden tests skip; Lane B's tests that call `renderReport()` must set
  `HESABU_RENDERER_ALLOW_STUB=1` or CI needs `npx playwright install --with-deps chromium` before `pnpm test`.
- Lane B: `import { renderReport, closeBrowser } from '@hesabu/renderer'`; validate nothing yourself, the renderer
  validates both documents; call `closeBrowser()` on worker shutdown; never deliver an artefact when `stubbed` is true.
- Lane A: `packages/report-model/fixtures/*.json` are the weekly and monthly reports for the report screen;
  `packages/charts/src/charts/*.tsx` hold the data shapes and layout rules to mirror in Compose.
- The web viewer needs `API_BASE_URL` (or `HESABU_API_BASE_URL`) at runtime; without it `/r/[token]` shows an
  honest error page rather than a half report.

## Second package (orchestrator check-in 1)

- Audit of `/dev/report` and the hero against the brief (the `impeccable` skill is not available in this session).
  Fixed: trend-line labels colliding at 360 px (series named at the line ends, months abbreviated), ledger columns
  touching when a text column follows an amount, year-to-date KPI amounts overflowing their print tiles (caught by
  the new PDF test), phone table scroll region not keyboard-focusable.
- Golden heroes reviewed at 25 %: title, period, tally and total read; the insight lines are at the 28 px floor and
  still legible. No change needed.
- Lighthouse after the fixes: accessibility 100, performance 98 on both fixtures (mobile profile).
- Design review of Lane B's real artefacts (`docs/sprint/samples/`), fixed in lane C: hero donut now labels the
  largest slice outside the ring with the next two as swatch rows; the six-plus-Other cap is enforced inside the
  Donut component; the daily-bars average label lives in a reserved margin, never over a bar; the delta reads as
  prose ("KSh 23,375 less than last week") in hero, web and email; names that arrive in capitals render in title
  case (`humanName()`, keeps KPLC and Ltd); dark-theme PDFs print on light paper; Kiswahili in/out labels no
  longer collide. Findings left with Lane B in `docs/sprint/LOG.md`: raw category ids and ISO dates in two chart
  titles, a signed delta repeated in the verdict, zero months before data in the trend.

## Known gaps

- `frontend-design` and `impeccable` skills were not available in this session; the design work and the polish pass
  were done directly against the brief, the chart spec and the dataviz skill's anti-pattern list.
- Insight drill-downs on the web viewer are not links yet: the public endpoint has no transactions resource. The
  `drilldown` filters are preserved in the document for the app.
- Chart hover is the native SVG `<title>` tooltip; there is no crosshair or keyboard-focusable data layer. The data
  table twin is the accessible route.
- The email was checked in Chromium with placeholder images, not in real clients (Gmail, Outlook, WhatsApp
  preview). It is table-based with inline styles and no CSS variables, which is the safe baseline.
- Lighthouse was run once locally; a slow-network run on a Moto G-class device remains for the integration phase.

## Where to resume

Nothing unfinished in scope. Next useful work, in order: (1) a `/r/[token]` Playwright test against a fake API once
Lane B's route exists; (2) the Compose mirror of the chart layouts for Lane A; (3) email client checks with Mailpit in
`make dev`; (4) keyboard-focusable chart marks.
