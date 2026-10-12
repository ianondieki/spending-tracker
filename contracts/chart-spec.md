# Chart catalogue

Ten chart types, one implementation in `packages/charts` (React, SVG, no canvas) rendered on the web viewer, into
PNGs for WhatsApp and email (Playwright, 2× DPR), into the PDF, and re-implemented in Compose for the app from the same
data shapes. Load the `dataviz` skill before touching any of them. Tokens come from `contracts/design-tokens.json`.

Common rules: the grid is the ruled line (`rule` token); title states the takeaway; direct labels, legends only when a
chart has more than three series; amounts formatted as `KSh 12,450`; no 3D, no dual axes, no gradients; both themes;
every chart exports `altText` (a sentence with the key numbers) and a `DataTable` toggle on web and in the app; chart
ids are stable strings used by `ReportDocument.sections[].chart_id`.

| chart_type | data_ref (FactsSheet) | Data shape | Notes |
|---|---|---|---|
| `donut` | `/categories` | `{name, cents, display, color}[]`, at most 6 + Other | Centre shows total out; top slice labelled outside; Other uses `other_slice` |
| `daily_bars` | `/daily` + `/average_daily_out` | `{label, cents}[]`, average line | Spendiest day labelled; weekly: 7 bars; monthly: 28 to 31 bars, label every 7th |
| `stacked_in_out` | `/totals`, `/previous_totals` | two bars (this, previous) with in and out | Net written above each bar |
| `trend_lines` | `/trend_months` | `{label, in, out, net}[]` 6 points | Current month highlighted with a band; monthly only |
| `top_bars` | `/merchants` or `/people` | `{name, cents, display, is_new}[]` top 8 | Horizontal, sorted, new items marked with a dot |
| `waterfall` | `/totals` + `/categories` | income → categories (top 5 + Other) → net | Monthly only |
| `calendar_heatmap` | `/daily` | month grid, cell intensity by out | Monthly only; weekday headers in locale |
| `budget_bullets` | `/budgets` | `{name, limit, spent, projected}[]` | Projected shown as a hollow extension |
| `balance_sparkline` | `/accounts[i]/balance_series` | `{at, cents}[]` | One per account; last value labelled |
| `fee_meter` | `/totals/fees`, `/totals/fee_ratio` | one value and a ratio | A short ruled bar, not a gauge |

Hero image (`packages/renderer`, 1080×1350): sheet background, period and the word Hesabu at top, the tally (seven
day rows or top categories) with the total under a double rule, one small `donut` bottom right, three insight lines,
"Full report" line at the foot. Readable at 25 % scale: minimum text 28 px at 1×.
