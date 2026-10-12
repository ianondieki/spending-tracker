# @hesabu/worker

**Owner:** Lane B (backend and agents). **Purpose:** the background process: the scheduler in Africa/Nairobi
(Monday weeks), the report workflow collect → insight-select → write → check → render → deliver, delivery jobs
with idempotency, and the cost cap for model calls.

Scaffolded during the 24-hour sprint: `run()` logs and exits with zero jobs.

## Run

- `pnpm dev` — `tsx src/main.ts` (runs once and exits).
- `pnpm build && pnpm start` — compiled `dist/main.js`.
- `pnpm test` — Vitest; `run()` takes an injectable logger so tests capture output.

## Conventions

- `src/index.ts` exports `run()` and types; `src/main.ts` is the runnable entry (exit code 0 on success, 1 on failure).
- Depends on `@hesabu/analytics` (facts sheet); at runtime that resolves to its `dist/`, so `pnpm build` at the root
  before `pnpm start`. Tests resolve it to source via `vitest.shared.ts`.
- Nothing here may contact a real provider in tests.
