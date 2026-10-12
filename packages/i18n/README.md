# @hesabu/i18n

English and Kiswahili message catalogues, insight templates, and the one substitution routine that reports,
emails and the web viewer use. Kiswahili copy is written natively, not translated word by word, and is tagged
`[[COPY-REVIEW]]` until a native speaker signs it off.

## What is here

| File | Holds |
|---|---|
| `src/locales/en.json`, `sw.json` | Report chrome: titles, hero verdicts per delta direction, KPI labels, section and table titles, chart titles and alt-text templates for all ten chart types, fee callout, watch items, footer note, WhatsApp and email bits. Same keys in both. |
| `src/insights/en.json`, `sw.json` | A `headline` (≤ 90 chars rendered) and `body` (≤ 280) per candidate-insight kind, with optional `variants` picked by `variant_param` (`direction`, `cadence` or `metric`). |
| `src/insight-params.ts` | `INSIGHT_PARAMS`: the exact params the analytics engine emits per kind. Templates may use only these. |

## API

```ts
t(locale, key)                         // message, English fallback when a Kiswahili key is missing
renderTemplate(locale, key, params)    // t() plus {name} substitution
renderInsight(locale, kind, params)    // { headline, body } from the engine's params
substitute(template, params, allowed?) // the substitution itself
```

Substitution fails closed: a placeholder with no value (or `null`) throws `TemplateError`, and an insight
template that names a param outside `INSIGHT_PARAMS[kind]` throws, so a typo cannot ship. Substitution is a
single pass, so a merchant name containing `{x}` is never expanded.

## Writing copy

Short, concrete sentences in the second person; warm and honest; no exclamation marks; no moralising; fees
called out plainly; loans and Fuliza described neutrally. Templates contain no digits: every number comes from a
param that holds a display string from the facts sheet (the fact-checker in `@hesabu/agents` enforces it).
Kiswahili uses everyday Kenyan vocabulary (pesa, ada, matumizi, mapato, Jumatatu).

Tests check that every insight kind has both locales, every placeholder is an engine param, nothing has an
exclamation mark, a digit or a stray brace, and rendered lengths stay within the limits with realistic params.

## Scripts

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm clean`
