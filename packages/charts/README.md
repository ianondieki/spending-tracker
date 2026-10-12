# @hesabu/charts

**Owner:** Lane C (charts, renderer, web). **Purpose:** the chart catalogue as React components (donut, daily bars with average, top-N bars, trend, fee meter, sparkline) in light and dark themes, rendered by the web viewer and by the renderer to PNG.

Scaffolded during the 24-hour sprint with placeholder code; the owning lane replaces `src/` as it builds.

## Conventions

- ESM + TypeScript strict (`tsconfig.base.json`), NodeNext resolution: relative imports end in `.js`.
- `src/index.ts` is the public surface. Other workspace packages import `@hesabu/charts` only.
- Types resolve from `src/` (no build needed for `pnpm typecheck`); runtime imports resolve to `dist/`
  (`pnpm build` at the root builds in dependency order).
- Tests live in `src/**/*.test.ts` (Vitest). Sibling packages resolve to their source in tests via the alias in
  `vitest.shared.ts`, so tests never need a prior build.

## Scripts

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm clean`
