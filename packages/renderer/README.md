# @hesabu/renderer

**Owner:** Lane C (charts, renderer, web). **Purpose:** turning a `ReportDocument` into deliverables: hero PNG (1080×1350) and chart PNGs via Playwright, PDF from the print stylesheet, and the HTML used by the email template and web viewer.

Scaffolded during the 24-hour sprint with placeholder code; the owning lane replaces `src/` as it builds.

## Conventions

- ESM + TypeScript strict (`tsconfig.base.json`), NodeNext resolution: relative imports end in `.js`.
- `src/index.ts` is the public surface. Other workspace packages import `@hesabu/renderer` only.
- Types resolve from `src/` (no build needed for `pnpm typecheck`); runtime imports resolve to `dist/`
  (`pnpm build` at the root builds in dependency order).
- Tests live in `src/**/*.test.ts` (Vitest). Sibling packages resolve to their source in tests via the alias in
  `vitest.shared.ts`, so tests never need a prior build.

## Scripts

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm clean`
