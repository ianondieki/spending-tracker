# spending-tracker (Hesabu, working name)

A Kenyan personal-finance companion: the Android app reads money messages (M-Pesa, Airtel Money, T-Kash, banks, cards,
wallets) on the phone, parses them on the device into a categorised ledger, and an agent workflow sends a designed,
chart-rich weekly and monthly report to the user's WhatsApp and email, with the full interactive story in the app.

This repository currently holds the **build prompt pack**. The application is built phase by phase with Claude Code.

| File | Purpose |
|---|---|
| `prompts/MASTER-BUILD-PROMPT.md` | The full specification and operating instructions. Paste it once, in Phase 0. |
| `prompts/PHASE-KICKOFFS.md` | One short prompt per phase (0–8) to start each later session. |
| `CLAUDE.md` | Always-loaded rules: session rhythm, principles, spec index, commands, commits, agents. |

How to start: open Claude Code in this repo on branch `claude/beautiful-pascal-w5oxu3`, paste
`prompts/MASTER-BUILD-PROMPT.md`, let Phase 0 run (documents only), answer the questions it writes to
`docs/DECISIONS-NEEDED.md`, approve gate G0 in `docs/GATES.md`, then run Phase 1 with its kickoff.
