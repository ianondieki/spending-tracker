# Phase kickoff prompts

Paste **one** of these as the first message of a new Claude Code session (after `prompts/MASTER-BUILD-PROMPT.md` has
been used once, in Phase 0). Each kickoff assumes `CLAUDE.md` is loaded automatically. Replace `<…>` placeholders.
Run the phases in order; do not start a phase whose gate is not approved in `docs/GATES.md`.

---

## Phase 0 — Discovery and plan (documents only)

Read `CLAUDE.md` and `prompts/MASTER-BUILD-PROMPT.md` in full. This session is Phase 0 as defined in §16: documents
only, no application code. Produce every Phase 0 deliverable, write ADR-001..006 with real trade-offs (Android stack,
backend stack, data model, parsing strategy, report rendering, delivery providers), write the requirements register
with Given/When/Then acceptance tests for every requirement ID family, write the design brief after loading the
`frontend-design` skill, expand §10 into `docs/REPORT_SPEC.md` with the facts-sheet and ReportDocument JSON schemas,
research and cite the Play SMS policy, WhatsApp Business Platform rules and Kenya pricing, email providers, ODPC
registration and known provider sender IDs, and fill `docs/DECISIONS-NEEDED.md` with the questions in §14. Create the
sub-agent files in `.claude/agents/`. Finish with the traceability check passing, a Phase 0 report in
`docs/PROGRESS.md`, and stop at gate G0.

## Phase 1 — Foundations

Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS-NEEDED.md`, `docs/GATES.md` (G0 must be approved) and
§4–§6, §13, §16–§18 of `prompts/MASTER-BUILD-PROMPT.md`. Build Phase 1: monorepo and CI, backend skeleton with auth,
tenancy and migrations, frozen OpenAPI, the Android skeleton with the design-brief theme, the SMS disclosure and
permission flow, live receiver, 12-month backfill, the complete M-Pesa provider pack, Room with SQLCipher, sync, the
`tools/redact-sms` tool and the first golden corpus. I will supply real redacted M-Pesa messages when you ask; do not
invent formats. Exit when M-Pesa parse accuracy is ≥ 99.5 % on the corpus, the balance-chain check works, tenancy
cross-access tests fail closed and the app lists parsed transactions live. Report and stop at G1.

## Phase 2 — Parsing breadth and categorisation

Read the context files, then §6–§7 and §16–§18. Build Airtel Money, T-Kash, bank and card provider packs plus the
generic fallback, transfer matching, dedupe, the taxonomy and merchant table, user rules with precedence, the
categoriser agent (batched, structured output; load the `claude-api` skill first), the Transactions screen with
correction and "Teach Hesabu", and the share-to-app and paste import paths. Ask me for sample messages per provider.
Exit on per-provider corpus accuracy, zero double counting on the transfer set and categoriser accuracy ≥ 90 % on the
labelled set. Report and stop at G2.

## Phase 3 — Analytics and in-app insight

Read the context files, then §8, §10 (chart catalogue), §12 and §16–§18. Build `packages/analytics` with the full
facts sheet and drill-down descriptors, `packages/charts` and the Compose charts from the shared chart spec (load
`dataviz` first), and the Home, Accounts, Insights and Budgets screens with all states. Run the design pass
(`frontend-design` → `impeccable` → screenshots at 360/412/1440 → axe → `ux-reviewer`). Exit on facts-sheet property
tests, chart snapshots in both themes, `ux-reviewer` PASS and the low-end performance budgets. Report and stop at G3.

## Phase 4 — Report engine

Read the context files, then §9–§12 and §16–§18. Build workflow steps collect → insight-select → write → check →
render, the renderer outputs (hero PNG, chart PNGs, PDF, HTML email, web viewer), the report archive screen, email
delivery, the WhatsApp share-sheet delivery, Africa/Nairobi schedules and the degraded numbers-only path. Generate a
full weekly and monthly report from the seeded ledger in English and Kiswahili, light and dark, and attach them to
the phase report for my review. Exit on 100 % numeric fidelity and email delivered to Mailpit in CI. Stop at G4.

## Phase 5 — WhatsApp Cloud API

Read the context files, then §11 and §13. Build the `WhatsAppProvider` Cloud API implementation behind the interface,
the utility templates, the `JOIN` opt-in flow, webhooks, delivery tracking, caps and the admin delivery dashboard, and
write the Meta verification checklist for me. Everything runs against the provider fake; a single sandbox send to my
own number happens only after I approve it in `docs/GATES.md`. Stop at G5.

## Phase 6 — Ask assistant and evals

Read the context files, then §9 and §18. Build the coach agent with read-only typed tools, streaming, citations and
daily caps, the Ask screen in both languages, and the nightly evals suite (parser extractor, categoriser, numeric
fidelity, judge rubric, injection red team, cost per report) with a spend cap. Exit when the injection set shows zero
instruction-following, cost per weekly report is under the agreed cap and judge scores clear the thresholds. Stop at G6.

## Phase 7 — Polish and compliance

Read the context files, then §12–§13. Complete Kiswahili, the accessibility pass, low-end performance, OEM background
guidance, privacy policy and terms drafts tagged `[[LEGAL-REVIEW]]`, the Play listing, Data Safety form, SMS
declaration text and demo video script, and statement-import groundwork. List every `[[COPY-REVIEW]]` and
`[[LEGAL-REVIEW]]` item for me. Stop at G7.

## Phase 8 — Audit and launch

Read the context files, then §13 and §19. Run the `security-reviewer` audit over the whole system, the load and cost
review, write the runbooks (delivery failures, provider format change, cost spike, key rotation) and the launch
checklist and beta rollout plan. Exit with no open critical or high findings and the definition of done met. Stop at G8.
