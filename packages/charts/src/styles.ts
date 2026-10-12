/**
 * Stylesheet for chart frames and the ruled ledger table, as a string so the renderer can inline it and the web
 * viewer can import it. Uses the theme variables from `theme.ts`; no colours are written here.
 */
export const chartStyles = `
.h-chart { margin: 0; max-width: 100%; }
.h-chart__caption { display: block; margin: 0 0 12px; }
.h-chart__title { display: block; font-size: 16px; font-weight: 500; line-height: 1.45; color: var(--h-ink); }
.h-chart__takeaway { display: block; margin-top: 4px; font-size: 14px; line-height: 1.45; color: var(--h-ink-soft); }
.h-chart__plot { overflow: visible; }
.h-chart__plot svg { display: block; width: 100%; height: auto; }
.h-chart__data { margin-top: 8px; }
.h-chart__toggle { display: inline-flex; align-items: center; min-height: 48px; padding: 0 4px; cursor: pointer; font-size: 14px; color: var(--h-biro); list-style: none; }
.h-chart__toggle::-webkit-details-marker { display: none; }
.h-chart__toggle::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 180ms; }
.h-chart__data[open] > .h-chart__toggle::before { transform: rotate(45deg); }
.h-chart__toggle:focus-visible { outline: 2px solid var(--h-biro); outline-offset: 2px; border-radius: 4px; }
.h-ledger { width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.45; color: var(--h-ink); font-variant-numeric: tabular-nums; }
.h-ledger th, .h-ledger td { padding: 10px 0; border-bottom: 1px solid var(--h-rule); text-align: left; font-weight: 400; vertical-align: top; }
.h-ledger th { color: var(--h-ink-soft); }
.h-ledger thead th { font-size: 14px; }
.h-ledger tbody th { color: var(--h-ink); }
.h-ledger .h-num { text-align: right; white-space: nowrap; }
.h-ledger .h-num + .h-num { padding-left: 16px; }
.h-ledger .h-total th, .h-ledger .h-total td { font-weight: 700; border-top: 1px solid var(--h-ink); border-bottom: 3px double var(--h-ink); }
.h-ledger--compact { font-size: 14px; }
.h-ledger--compact th, .h-ledger--compact td { padding: 8px 0; }
.h-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) { .h-chart__toggle::before { transition: none; } }
@media print { .h-chart__data { display: none; } }
`;
