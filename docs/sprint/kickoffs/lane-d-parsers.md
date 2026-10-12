# Lane D — Provider packs, pack engine, taxonomy, demo inbox

Contracts: `provider-pack.schema.json`, `PROVIDER-PACKS.md`, `transaction.schema.json`. Master prompt: §6, §7.
Start from `corpus/` (the redaction tool, the public unverified samples and `MISSING-FAMILIES.md` are there) and
`docs/research/sms-formats.md`.

Deliver in this order:

1. **Pack engine (`packages/pack-engine`).** The TypeScript reference implementation of `PROVIDER-PACKS.md`: pack
   loading with schema validation and rejection of non-portable regex constructs, sender filter, prefilter, families
   in order, normalisers, post-processing (dedupe, transfer matching, balance chain), unknown handling. A CLI
   `pack-engine run --pack <file> --corpus <jsonl>` printing per-family counts and unknowns. A Vitest suite that runs
   every example of every pack and every corpus file against its pack and fails on any unknown message not listed in
   that provider's `MISSING-FAMILIES.md`.
2. **M-Pesa pack (`contracts/provider-packs/mpesa.json`).** One family per message type with an example: send money,
   receive, pay bill, buy goods, withdraw, deposit, airtime, Fuliza drawdown and repayment, M-Shwari in and out, bank
   to M-Pesa, M-Pesa to bank, Pochi, reversal, plus ignore families for balance queries and failed transactions.
   Anchor every amount to its label (three-amounts rule). `verified: false` until the body comes from a real export.
3. **Other packs.** Airtel Money, T-Kash and bank or card packs for every family with a real example; a generic bank
   alert family (debited or credited with an amount and a balance) at low confidence only where a real example
   exists. Keep `MISSING-FAMILIES.md` honest.
4. **Taxonomy (`packages/taxonomy`).** The two-level category taxonomy from master prompt §7 with ids and en/sw
   names; provider-default rules (type → category); merchant seeds for Kenyan paybills, tills and names you can
   source (KPLC, Safaricom, DSTV, Zuku, Naivas, Carrefour, Quickmart, Uber, Bolt, Netflix, Showmax, SHA, NTSA, KRA,
   eCitizen and more), each marked verified with a source URL or unverified; exported as JSON for the app's assets
   and the backend.
5. **Demo inbox (`corpus/demo/`).** A deterministic generator producing `demo-inbox.jsonl`: eight weeks of realistic
   synthetic messages for one persona in the exact formats your packs parse (month-end salary by bank credit, bank
   to M-Pesa transfers, rent by pay bill, KPLC tokens, Naivas till, matatu cash withdrawals, airtime, Uber, Netflix,
   one Fuliza episode, money sent to family, money received from a friend, an M-Shwari deposit, a duplicate payment).
   The engine must parse 100 % of it with correct transfers and balance chains. Both the app's demo mode and the
   backend's demo seed consume this file.
6. **Real export.** Each hour, merge the integration branch and look for the user's redacted export under
   `corpus/`. When it arrives, run every pack over it, fix patterns, flip `verified: true` on bodies taken from it,
   and report per-family accuracy in the lane report.
