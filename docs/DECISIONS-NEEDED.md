# Decisions needed from the human

Append-only. Each entry: date, lane, the conflict, what was done meanwhile, what the human decides.

## 2026-10-12 lane D — demo inbox needs a bank alert format, but no real bank alert exists

**Conflict.** The lane D kickoff asks for a demo inbox with "month-end salary by bank credit" and "bank to M-Pesa
transfers" whose transfer pairs the engine must match, and at the same time forbids inventing any message format
(bank families only where a real example exists). `corpus/banks/` has no real alert, so no real bank pack can be
written.

**Done meanwhile.** A clearly synthetic pack `contracts/provider-packs/demo_bank.json` for a fictional "Hesabu Demo
Bank" with sender id `HESABUDEMO` (no real institution uses it). It invents nothing about any real bank, parses only the
demo inbox, and is documented as demo-only (load it only in demo mode). The demo persona banks with "Hesabu Demo Bank".

**Decide.** (a) Keep the synthetic demo bank until real Equity/KCB/… alerts arrive through `tools/redact-sms` (then
the demo inbox switches to the real format), or (b) drop bank messages from the demo (no salary credit, no transfer
pair in the demo), or (c) supply one real redacted bank alert now.
