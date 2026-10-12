# @hesabu/charts

**Owner:** Lane C. **Purpose:** the ten report chart types from `contracts/chart-spec.md` as React SVG components,
rendered by the web viewer, the renderer (PNG, PDF, email) and re-implemented in Compose from the same data shapes.

## Rules baked in

- Deterministic: no DOM measurement, no randomness; text is measured with `text.ts` estimates. Snapshot-tested.
- Tokens as CSS variables (`theme.ts`): `--h-ink`, `--h-in`, `--h-fee`, `--h-cat-1..6` and so on. No literal colour
  reaches a mark. `themeStyle(theme)` sets them inline on the figure (self-contained markup); `themeStylesheet()`
  sets them on `:root` and `[data-theme]` for a page.
- The grid is the ruled line; spend is ink, never red; fees are the one warm colour; bars ≤ 24 px with a 4 px rounded
  data end and square baseline; 2 px lines; markers with a 2 px surface ring; direct labels, legends only for
  more than three series.
- Every chart exports `<name>AltText(data, locale)` and `<name>Table(data, locale)`; the `Figure` frame renders the
  takeaway, the SVG (`role="img"` with the alt text) and the data table twin behind a native `<details>` toggle.
- Both locales (`chartLabels(locale)`), both themes, two widths (`DEFAULT_WIDTH` 672, `PHONE_WIDTH` 328).

## Use

```tsx
import { resolveChart } from '@hesabu/charts';
// section: a `chart` section of a ReportDocument; facts: its FactsSheet
const element = resolveChart(section, facts, { locale: 'en', theme: 'dark', width: 672 });
```

Or any chart directly: `<Donut id="categories" title="…" locale="en" data={donutData(facts, 'en')} />`.

`chartStyles` is the stylesheet for the frame and the ruled ledger table (`.h-ledger`), to inline or import.

## Commands

`pnpm test` (snapshots in `src/__snapshots__/`, `-u` to refresh after a deliberate change), `pnpm lint`,
`pnpm typecheck`, `pnpm build`, `pnpm tokens` (re-copies `contracts/design-tokens.json`; a test fails when stale).
