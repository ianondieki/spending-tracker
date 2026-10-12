# Hesabu design brief (sprint edition)

The single source of truth for the Android app, the web report, the email, the PDF and the WhatsApp hero image.
`contracts/design-tokens.json` is the machine-readable version; this file explains the choices.

## The idea: a ruled ledger, not a dashboard

Kenyan money already has a visual vernacular: the shopkeeper's ruled exercise book where debts and payments are
tallied in blue ballpoint, the agent's hand-written tally, the M-Pesa confirmation text itself. Hesabu borrows the
ledger, not the dashboard. Money screens are ruled sheets: rows sit on hairline rules, amounts right-align in one
numeral column, and a total is earned by the column above it and marked with the bookkeeper's double rule. Charts
share the same rules as their grid. Prose sections have no rules at all, so the rule means "money is being counted
here" and nothing else.

The one memorable element is the **tally**: a ruled column of days or categories that adds up to a large total under a
double rule. It opens every report and the Home screen. Everything around it stays quiet.

## Palette (light)

| Token | Hex | Role |
|---|---|---|
| paper | `#F3F5F7` | page surface, cool blue-grey white (not cream) |
| sheet | `#FFFFFF` | raised ledger sheets and the hero image background |
| rule | `#C9D2DC` | the ruled line, chart grid, dividers between money rows |
| ink | `#141E2E` | text and **money out** (spending is written in ink, never in red) |
| ink-soft | `#5B6878` | secondary text, axis labels |
| biro | `#1F4FD8` | the single interactive accent: buttons, links, focus, selected state |
| in | `#1E7F5C` | money in |
| fee | `#B7791F` | fees and charges, the cost of moving money |
| transfer | `#6B7A8F` | movements between the user's own accounts and cash withdrawals |
| warn | `#A23B2A` | reserved for errors and genuine problems only, never for spending |

## Palette (dark)

| Token | Hex | Role |
|---|---|---|
| paper | `#101722` | blue-slate, a chosen dark, not a tinted black |
| sheet | `#17202D` | sheets |
| rule | `#2A3443` | rules and grid |
| ink | `#E8ECF1` | text and money out |
| ink-soft | `#9AA6B5` | secondary |
| biro | `#6D8DFF` | accent |
| in | `#4FC08D` | money in |
| fee | `#E0A43C` | fees |
| transfer | `#8A98AC` | transfers and cash |
| warn | `#E0705C` | errors |

Chart series for categories use a six-step ramp derived from ink and biro (see `charts.categorical` in the tokens),
never a rainbow; semantic colours above are reserved for their meaning.

## Type

One family: **Schibsted Grotesk** (Google Fonts, OFL, bundle the TTF in the app). Weights 400, 500, 700. Tabular
figures (`tnum`) on every number. Scale (px): 12, 14, 16, 20, 28, 40, 56. Line-height 1.45 for prose, 1.1 for
numerals. Line length under 70 characters. Totals are set at 40 or 56 in weight 700; labels in 14/400 sentence case.
No all-caps labels, no eyebrows, no monospace for data, no middle-dot separators, no arrows appended to buttons.

## Layout and surfaces

Spacing scale 4, 8, 12, 16, 24, 32, 48. Radius 4 on controls, 8 on sheets, nothing larger. No drop shadows: sheets
are separated from paper by colour alone. Text left-aligned, numerals right-aligned. Phone layouts at 360 and 412 px,
web at 1440 with a 720 px reading column for reports. Touch targets 48 dp. Focus ring: 2 px biro.

## Motion

One moment: when a report or the Home tally opens, rows appear top to bottom over 300 ms and the double rule draws
under the total. Nothing else animates on its own. Interactions (expand, confirm) take 150 to 200 ms. `prefers-reduced-
motion` turns all of it off.

## Charts

Follow `contracts/chart-spec.md` and the `dataviz` skill. Grid lines are rules. Direct labels over legends. Title
states the takeaway. Both themes. Every chart has an accessible text summary.

## Voice

Second person, sentence case, short sentences, no exclamation marks, no judgement. Verbs name actions exactly:
"Save category", then "Category saved". Empty states invite an action: "No messages yet. Hesabu reads your money
messages as they arrive." Errors say what happened and what to do.

## Not this

Cream paper with a serif, black with acid green, broadsheet columns, identical rounded cards with grey shadows,
gradient washes, flag colours, safari motifs, mascots, red for spending.
