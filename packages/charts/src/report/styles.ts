/**
 * The report page stylesheet (ruled ledger). Colours come only from the theme variables; sizes from the token
 * scale (12, 14, 16, 20, 28, 40, 56; spacing 4, 8, 12, 16, 24, 32, 48; radius 4 and 8; one hairline rule).
 * Exported as a string so the renderer can inline it and the web viewer can serve it.
 */
export const reportStyles = `
.h-report { max-width: 720px; margin: 0 auto; padding: 24px 24px 48px; background: var(--h-sheet); color: var(--h-ink); font-family: var(--h-font); font-size: 16px; line-height: 1.45; border-radius: 8px; }
.h-report a { color: var(--h-biro); }
.h-report :focus-visible { outline: 2px solid var(--h-biro); outline-offset: 2px; }
.h-num { text-align: right; }
/* Figures stay proportional: this font's tnum also widens the comma, which reads as "2 , 840". Alignment comes from the right edge. */
.h-masthead { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; padding-bottom: 12px; border-bottom: 1px solid var(--h-rule); font-size: 14px; color: var(--h-ink-soft); }
.h-masthead__brand { font-weight: 700; font-size: 16px; color: var(--h-ink); }
.h-masthead__period { margin-left: auto; }
.h-report__title { margin: 24px 0 0; font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: -0.01em; }
.h-hero { margin-top: 24px; }
.h-tally { width: 100%; border-collapse: collapse; }
.h-tally__row th, .h-tally__row td { padding: 10px 0; border-bottom: 1px solid var(--h-rule); font-weight: 400; text-align: left; line-height: 1.1; }
.h-tally__row td.h-num, .h-tally__total td.h-num { text-align: right; }
.h-tally__row td { font-size: 16px; }
.h-tally__label { color: var(--h-ink-soft); font-size: 14px; }
.h-tally__total th, .h-tally__total td { padding: 16px 0 12px; border-top: 1px solid var(--h-ink); vertical-align: baseline; }
.h-tally__label--total { color: var(--h-ink); font-size: 14px; font-weight: 400; text-align: left; }
.h-tally__value--total { font-size: 40px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
.h-tally__rule { height: 0; border-bottom: 3px double var(--h-ink); }
.h-hero__delta { margin: 12px 0 0; font-size: 16px; font-weight: 500; }
.h-hero__verdict { margin: 12px 0 0; font-size: 20px; line-height: 1.45; max-width: 36em; }
.h-sections { margin-top: 32px; }
.h-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.h-table-scroll:focus-visible { outline: 2px solid var(--h-biro); outline-offset: 2px; border-radius: 4px; }
.h-ledger th.h-num { white-space: normal; }
.h-section { margin-top: 32px; }
.h-section__title { margin: 0 0 12px; font-size: 20px; font-weight: 500; line-height: 1.45; }
.h-kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 24px; margin: 0; border-top: 1px solid var(--h-rule); }
.h-kpi { padding: 12px 0; border-bottom: 1px solid var(--h-rule); min-width: 0; }
.h-kpi__label { font-size: 14px; color: var(--h-ink-soft); }
.h-kpi__value { margin: 4px 0 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.h-kpi__amount { font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: -0.01em; white-space: nowrap; }
.h-kpi[data-tone="in"] .h-kpi__amount { color: var(--h-in); }
.h-kpi[data-tone="fee"] .h-kpi__amount { color: var(--h-fee); }
.h-kpi[data-tone="transfer"] .h-kpi__amount { color: var(--h-transfer); }
.h-kpi__delta { font-size: 14px; color: var(--h-ink-soft); }
.h-chart-size--phone { display: none; }
.h-insights, .h-watch, .h-list { margin: 0; padding: 0; }
.h-insights { list-style: none; }
.h-insight { margin-top: 16px; }
.h-insight:first-child { margin-top: 0; }
.h-insight__headline { margin: 0; font-size: 16px; font-weight: 500; line-height: 1.45; }
.h-insight__body { margin: 4px 0 0; font-size: 16px; max-width: 40em; }
.h-list { padding-left: 1.2em; }
.h-list li, .h-watch li { margin-top: 8px; max-width: 40em; }
.h-watch { list-style: none; counter-reset: watch; }
.h-watch li { position: relative; padding-left: 32px; counter-increment: watch; }
.h-watch li::before { content: counter(watch); position: absolute; left: 0; top: 0; width: 24px; height: 24px; border-radius: 4px; background: var(--h-biro); color: var(--h-on-biro); font-size: 14px; font-weight: 500; line-height: 24px; text-align: center; }
.h-callout { margin: 24px 0 0; padding: 12px 16px; border-left: 3px solid var(--h-rule); background: var(--h-paper); border-radius: 0 4px 4px 0; }
.h-callout p { margin: 0; max-width: 40em; }
.h-callout--fee { border-left-color: var(--h-fee); }
.h-callout--warn { border-left-color: var(--h-warn); }
.h-footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--h-rule); font-size: 14px; color: var(--h-ink-soft); }
.h-footer__note { margin: 0; color: var(--h-ink); }
.h-footer__meta { margin: 12px 0 0; display: grid; gap: 8px; }
.h-footer__meta dt { display: inline; }
.h-footer__meta dt::after { content: ": "; }
.h-footer__meta dd { display: inline; margin: 0; color: var(--h-ink); text-align: left; }
.h-footer__writer { margin: 12px 0 0; }
.h-button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 24px; border-radius: 4px; background: var(--h-biro); color: var(--h-on-biro); text-decoration: none; font-weight: 500; }
.h-report a.h-button { color: var(--h-on-biro); }
.h-report--monthly .h-tally__row td { font-size: 16px; }
@media (min-width: 720px) {
  .h-report { padding: 32px 24px 48px; }
  .h-report__title { font-size: 40px; }
  .h-tally__value--total { font-size: 56px; }
  .h-kpis { grid-template-columns: repeat(4, 1fr); }
}
@media (max-width: 719px) {
  .h-report { padding: 16px 16px 32px; border-radius: 0; }
  .h-chart-size--web { display: none; }
  .h-chart-size--phone { display: block; }
}
@keyframes h-row-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes h-rule-in { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@media (prefers-reduced-motion: no-preference) {
  .h-report--web .h-tally__row, .h-report--web .h-tally__total { animation: h-row-in 300ms both; animation-delay: calc(var(--i, 0) * 30ms); }
  .h-report--web .h-tally__rule { transform-origin: left; animation: h-rule-in 300ms both; animation-delay: calc(var(--rows, 7) * 30ms + 200ms); }
}
@media print {
  @page { size: A4; margin: 14mm 14mm 16mm; }
  html, body { background: #fff !important; }
  .h-report { max-width: none; padding: 0; border-radius: 0; background: #fff; color: #141E2E; }
  .h-chart-size--phone, .h-chart__data, .h-footer__link, .h-skip { display: none !important; }
  .h-chart-size--web { display: block !important; }
  .h-section, .h-callout, .h-kpis, .h-hero { break-inside: avoid; }
  .h-section__title { break-after: avoid; }
  .h-kpi__amount { font-size: 24px; }
  .h-kpis { gap: 0 16px; }
  .h-tally__row, .h-tally__total, .h-tally__rule { animation: none !important; }
}
`;
