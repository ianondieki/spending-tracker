# Contract change requests

Append-only. Format: `- [ ] <date time UTC> lane X: <file> — <what and why> — proposed: <diff summary>`.
The orchestrator ticks the box when merged and bumps the contract version.
- [ ] 2026-10-12 13:52 UTC lane C: `design-tokens.json` `charts.categorical` — the dataviz validator fails the six-step ramp on the lightness band, chroma floor and the normal-vision floor (adjacent pair `#9AA6B5`/`#7B93E8` light, `#A9BBFF`/`#9AA6B5` dark, ΔE 11 < 15). Expected for a deliberate ink-to-biro monochrome ramp; the brief wins, so Lane C keeps the ramp and never relies on colour alone (direct labels, 2 px surface gaps, data table on every chart). No change needed now — proposed, if the orchestrator wants a stronger ramp later: reorder slots light/dark alternating so adjacent slices differ by ≥ 15 ΔE (`#141E2E, #7B93E8, #1F4FD8, #C2CCF5, #5B6878, #9AA6B5`).
