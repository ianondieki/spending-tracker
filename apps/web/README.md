# @hesabu/web

**Owner:** Lane C (charts, renderer, web). **Purpose:** the Next.js 15 (App Router) web viewer: the signed report
link `/r/[token]` that opens the full interactive report, plus the pages the email and WhatsApp messages link to.

Scaffolded during the 24-hour sprint: `/` renders "Hesabu" with a placeholder chart; `/r/[token]` is a stub that
does not verify tokens yet.

## Run

- `pnpm dev` — `next dev` on http://localhost:3000.
- `pnpm build` — `next build` (also type-checks). No Google Fonts: nothing in the build needs the network. Set
  `NEXT_TELEMETRY_DISABLED=1` offline.
- `pnpm test` — Vitest renders components with `react-dom/server`; tests live in `test/`.
- `pnpm typecheck` — `next typegen && tsc --noEmit`. `next-env.d.ts` and `.next/types/` are generated (gitignored),
  so typecheck works on a fresh clone without a full `next build`.

## Conventions

- `app/` routes only; shared UI comes from `@hesabu/charts` (runtime import resolves to its `dist/`, so run the
  root `pnpm build` before `next build`/`next dev`; tests resolve it to source via `vitest.shared.ts`).
- No `next/font/google` (offline builds). Design tokens come from `contracts/`.
- Ordinary copy is tagged `[[COPY-REVIEW]]`; legal, claims, pricing and brand text wait for the human.
