# corpus/demo — the synthetic demo inbox

`demo-inbox.jsonl` is **not** a corpus of real messages. It is eight weeks (Monday 17 Aug – Sunday 11 Oct 2026) of
synthetic money SMS for one persona, generated deterministically by `packages/pack-engine/src/demo/generate.ts`, in
the exact shapes the provider packs already parse. The Android demo mode (Lane A) and the backend demo seed (Lane B)
both read this file; `demo-inbox.expected.json` records what any engine must get from it (counts per family, transfer
pairs, balance chain, per-account totals) so the Kotlin engine can assert parity.

Regenerate after changing the generator or a pack: `pnpm --filter @hesabu/pack-engine demo:write` (the test suite
fails if the committed file differs from the generator's output).

## Persona

Wanjiru, Nairobi. Salary KES 85,000 at month end into the fictional **Hesabu Demo Bank** (sender `HESABUDEMO`,
`contracts/provider-packs/demo_bank.json`; no real bank alert exists in the corpus, see `docs/DECISIONS-NEEDED.md`),
most of it moved to M-PESA the same morning (bank debit + M-PESA credit = one transfer pair). Rent 18,000 by pay bill,
KPLC tokens every two weeks, Naivas and Quickmart tills, matatu cash from an agent each Wednesday, airtime twice a
week, Uber on Thursdays, Netflix monthly (the August SMS is delivered twice: the dedupe drops one), 3,000 to mum and
5,000 to M-Shwari after each salary, 1,500 received from a friend, 10,000 moved back to the bank (M-PESA pay bill +
bank credit = a pair), and one Fuliza episode on 26 September (drawdown with the Quickmart payment's code, repaid in
full when the September salary lands). Balances are simulated, so every balance chain closes.

Line shape: `sender`, `provider`, `body`, `received_at` (Africa/Nairobi), `family_guess`, `synthetic: true`,
`redacted: false`, `source: "synthetic-demo"`, `sha256` of the body. Phone numbers and account numbers in the
bodies are invented; the engine masks them like real ones.

| | |
|---|---|
| messages | 82 (81 after dedupe) |
| transfer pairs | 3 |
| balance chain | 0 breaks |
| M-PESA account | `mpesa:07XXXXX123` (variables `sim_msisdn_masked=07XXXXX123`, `acct_mask=XXX456`) |
