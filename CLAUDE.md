# CLAUDE.md

Repository: `ianondieki/spending-tracker`. Product: **Hesabu** (working name, `[[NAME-REVIEW]]`), a Kenyan
personal-finance companion that parses money SMS (M-Pesa, Airtel Money, T-Kash, banks, cards, wallets) on the user's
Android phone, keeps a categorised ledger, and sends designed weekly and monthly reports to WhatsApp and email. The full
specification is `prompts/MASTER-BUILD-PROMPT.md`; this file is the short, always-loaded version. Development branch:
`claude/beautiful-pascal-w5oxu3`. The human merges at gates.

## Sprint mode (active until `docs/sprint/DONE.md` exists)

The 24-hour sprint in `prompts/24H-SPRINT.md` is running. Phases and gates are suspended. If you are a lane session,
your instructions are your kickoff prompt plus `docs/sprint/lanes.md`; `contracts/` is frozen. The orchestrator
session merges lane branches into `claude/beautiful-pascal-w5oxu3`. The rest of this file still applies, except the
"one phase per session" rule and the gate stops.

## Session rules

- One build phase per session, in order, as defined in `prompts/MASTER-BUILD-PROMPT.md` §16 and started with the
  matching kickoff in `prompts/PHASE-KICKOFFS.md`. Start by reading this file, then `docs/PROGRESS.md`,
  `docs/DECISIONS-NEEDED.md`, `docs/GATES.md`, then only the master-prompt sections the phase names.
- Phase 0 produces documents only (`docs/`, `.claude/agents/`, this file). Code starts in Phase 1.
- Sub-agents live in `.claude/agents/` and cannot spawn sub-agents. Never run an Opus agent at default (medium)
  effort for code.
- Stop and write to `docs/DECISIONS-NEEDED.md` (then continue unblocked work) when: a message would reach a non-test
  recipient; any spend or new vendor; a destructive migration, force-push or history rewrite; a principle would be
  broken or two requirements conflict; CI fails after three genuine fixes; legal, claims, pricing or brand text is
  needed (ordinary copy is written and tagged `[[COPY-REVIEW]]`); a gate is reached; a phase budget is exceeded.
- Secrets: sandbox and test values only, in an untracked `.env`; every variable documented in `.env.example`; every
  service fails closed when a secret is missing. Never commit secrets.

## Principles (short form; the master prompt §2 is authoritative)

Numbers are computed, never generated. Raw messages never leave the phone. Deterministic first, model second, learned
third. Transfers are not spending. Fees are first-class. Every number has a drill-down. Reports are designed objects.
Built for low-end Android on slow networks. All inbound text is untrusted data. Fail closed. Quiet, distinctive UI.
Kenyan by default (KES, Africa/Nairobi, Monday weeks, English and Kiswahili). Honest and kind tone. Cost-capped AI with
a numbers-only fallback.

## Spec index (read only what the phase needs)

| Master prompt section | Read it when |
|---|---|
| §1–§3 Mission, principles, scope | Any design decision; checking what is in or out of a release |
| §4 Architecture, §20 Repo layout | Choosing libraries, adding a package, wiring CI |
| §5 Data model | Schema, migrations, sync payloads |
| §6 Ingestion and parsing | SMS permission flow, receivers, backfill, provider packs, corpus |
| §7 Categorisation | Taxonomy, merchant table, rules, categoriser agent |
| §8 Analytics | Facts sheet, aggregates, drill-downs, any chart data |
| §9 Agents and orchestration | Any model call, workflow step, cost cap, redaction |
| §10 Reports | Report content, schedule, chart catalogue, hero image, tone |
| §11 Delivery | WhatsApp (share sheet, Cloud API), email, webhooks, idempotency |
| §12 App UX | Any screen, state, accessibility, i18n, performance budget |
| §13 Security and compliance | Auth, tenancy, device storage, DPA, Play declarations |
| §14–§15 Human decisions, stop rules | Before asking the human or stopping |
| §16–§19 Phases, agents, testing, done | Planning a session, writing tests and evals, the exit criteria |

Planning artefacts (from Phase 0): `docs/PLAN.md`, `docs/REQUIREMENTS.md` (requirement IDs R-ING, R-PRS, R-CAT,
R-ANL, R-RPT, R-DLV, R-UX, R-AI, R-SEC, R-OPS → acceptance tests), `docs/adr/`, `docs/THREAT_MODEL.md`,
`docs/DESIGN_BRIEF.md`, `docs/REPORT_SPEC.md`, `docs/GATES.md`, `docs/DECISIONS-NEEDED.md`, `docs/PROGRESS.md`,
`docs/research/`, `docs/tasks/<REQ-ID>.md`, `docs/checks/check_traceability.py`.

## Build workflow (every phase)

1. Context, then a short plan with task cards per requirement ID.
2. Build in small commits; ≤ 3 implementers in worktrees; only `db-migrations` writes migrations.
3. Tests for every acceptance test ID; all green; CI never reaches a real LLM, email, WhatsApp, SMS or payment provider.
4. Screens: `frontend-design` → `impeccable` → `dataviz` for charts → Playwright screenshots at 360/412/1440 →
   axe → `ux-reviewer`. Lighthouse locally: accessibility ≥ 90, performance ≥ 90, mobile profile.
5. Review: `reviewer` PASS on every PR; `security-reviewer` PASS for auth, tenancy, ingestion, AI, delivery, billing;
   `ux-reviewer` PASS on UI PRs. Fix every critical and high finding. `/code-review` is an extra pass, never a gate.
6. Report in `docs/PROGRESS.md`, run `python docs/checks/check_traceability.py`, stop at the gate.

## Build commands (filled in during Phase 1; keep this block current)

```sh
make dev            # local stack: Postgres 16, Mailpit, MinIO, api, worker, web
make check          # lint, types, unit and integration tests, parser corpus, Playwright smoke (egress-blocked)
make check-android  # ktlint, detekt, unit tests, Robolectric parser suite
make evals          # nightly only; needs ANTHROPIC_API_KEY and a spend cap; never in PR CI
```

## Commits and PRs

- Small conventional commits (≤ ~300 changed lines, one concern) naming a requirement ID:
  `feat(R-PRS-03): parse M-Pesa Buy Goods family`, `fix(R-ANL-07): …`, `docs(platform): …`, `chore(R-OPS-02): …`.
- Every commit message and PR body ends with:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

- Never `--no-verify`; never delete or skip a test to go green; never edit `corpus/` fixtures to make a parser pass
  (fix the parser or ask the human for a real sample).
- PRs target `claude/beautiful-pascal-w5oxu3`; merge only on `reviewer` PASS (plus the specialist PASS where required)
  and green CI; remove the worktree after merge.

## Agents (`.claude/agents/`, created in Phase 0)

| Agent | Model / effort | Use for |
|---|---|---|
| impl-android | opus / xhigh | Compose screens, ingestion, parsers, Room, sync (one task card each, in a worktree) |
| impl-backend | opus / xhigh | API, workflow, delivery, tenancy, policy code |
| impl-ai | opus / xhigh | agents, prompts, schemas, evals, redaction, cost caps |
| impl-web | opus / high | charts package, report renderer, web viewer, email templates |
| db-migrations | opus / xhigh | the only writer of migrations, tenancy policies, seeds |
| test-writer | sonnet / high | tests from Given/When/Then; corpus and fixture maintenance |
| reviewer | opus / high | adversarial review of every PR; reports, never fixes |
| security-reviewer | fable / xhigh | auth, tenancy, ingestion, AI, delivery; Phase 8 audit |
| ux-reviewer | opus / high | UI PRs against the design brief; axe, Lighthouse, screenshots |
| researcher | sonnet / high | cited external facts into `docs/research/` |
| docs-writer | sonnet / medium | README, runbooks, help text; never legal text |
| chore | haiku | renames, lint autofix, dependency bumps |
