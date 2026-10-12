# Lane C — Charts, renderer, web viewer, email

Contracts: `design-tokens.json`, `chart-spec.md`, `facts-sheet.schema.json`, `report-document.schema.json`,
`renderer-interface.md`, `openapi.yaml` (the public report endpoint). Master prompt: §10, §12. Load `dataviz` before
the first chart and `frontend-design` before the hero and the report page; use `impeccable` for a polish pass at the
end. Chromium for Playwright is preinstalled (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); do not run `playwright
install`.

Deliver in this order:

1. **Report model (`packages/report-model`).** TypeScript types generated from the two JSON schemas, ajv validators,
   and fixtures: a complete weekly and monthly `FactsSheet` plus matching `ReportDocument` in en and sw with realistic,
   internally consistent Kenyan content (M-Pesa, KPLC, Naivas, matatu cash, Fuliza, sent to family). Every number in
   the fixture copy appears in `display_strings`.
2. **Charts (`packages/charts`).** The ten chart types from `chart-spec.md` as React SVG components, deterministic,
   tokens as CSS variables, light and dark, `altText` and a `DataTable` toggle, snapshot tests of the SVG.
3. **Web viewer (`apps/web`).** `/r/[token]` fetches `GET /v1/public/reports/{token}` and renders the report in the
   ruled-ledger design: the tally hero, sections, charts, drill-down tables, 360 px and 1440 px layouts, print
   stylesheet for A4, both themes, Lighthouse accessibility and performance ≥ 90 on the mobile profile. A
   `/dev/report?fixture=weekly-en&theme=dark` route renders fixtures without an API. Playwright screenshots at 360
   and 1440 for both fixtures and themes committed under `apps/web/screenshots/`.
4. **Renderer (`packages/renderer`).** `renderReport()` per the interface: self-contained HTML (inline CSS, inline SVG
   charts via `renderToStaticMarkup`, fonts embedded) rendered with Playwright `setContent`: hero PNG 1080×1350 per
   the chart spec and design brief (legible at 25 %), chart PNGs at 1200 px wide 2× DPR, A4 PDF from the print
   stylesheet, table-based email HTML with `cid:` images and a plain-text alternative. Deterministic output; golden
   hero PNGs for both themes and locales committed under `packages/renderer/golden/`; tests check dimensions and
   snapshot the HTML.
5. **Polish.** `impeccable` audit on the report page and the hero; fix what it finds; axe clean.
