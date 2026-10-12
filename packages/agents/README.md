# @hesabu/agents

**Owner:** Lane B (backend and agents). **Purpose:** the report workflow steps that call the model (insight selection, writing) plus the deterministic fact-checker and the numbers-only fallback, redaction before every call, and the cost cap. The Anthropic SDK is added by Lane B (load the `claude-api` skill first).

Scaffolded during the 24-hour sprint with placeholder code; the owning lane replaces `src/` as it builds.

## Conventions

- ESM + TypeScript strict (`tsconfig.base.json`), NodeNext resolution: relative imports end in `.js`.
- `src/index.ts` is the public surface. Other workspace packages import `@hesabu/agents` only.
- Types resolve from `src/` (no build needed for `pnpm typecheck`); runtime imports resolve to `dist/`
  (`pnpm build` at the root builds in dependency order).
- Tests live in `src/**/*.test.ts` (Vitest). Sibling packages resolve to their source in tests via the alias in
  `vitest.shared.ts`, so tests never need a prior build.

## Scripts

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm clean`
