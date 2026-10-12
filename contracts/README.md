# Contracts

Frozen interfaces between the four sprint lanes. Only the orchestrator edits files here. A lane that needs a change
appends a request to `docs/sprint/CONTRACT-REQUESTS.md` (what, why, proposed diff) and continues with a local adapter
until the orchestrator merges the change and bumps the version.

| File | Defines | Produced by | Consumed by |
|---|---|---|---|
| `design-tokens.json`, `../docs/DESIGN_BRIEF.md` | colours, type, spacing, motion, hero image size | orchestrator | A, C |
| `transaction.schema.json` | Transaction, Account, SyncRequest, SyncResponse | orchestrator | A (produces), B (stores), D (engine output) |
| `provider-pack.schema.json`, `PROVIDER-PACKS.md` | pack format and engine semantics | orchestrator | D (writes packs), A (Kotlin engine), D (TS engine) |
| `facts-sheet.schema.json` | FactsSheet | B (`@hesabu/analytics`) | B (writer), C (charts, renderer), A (app charts) |
| `report-document.schema.json` | ReportDocument | B (writer, fallback) | C (renderer), A (report screen) |
| `chart-spec.md` | the ten chart types and data shapes | orchestrator | C, A |
| `renderer-interface.md` | `renderReport()` | C | B |
| `openapi.yaml` | the API | B | A, C |
| `provider-packs/` | the packs themselves | D | A |

Versioning: every schema has `version`; packs have semantic versions; the OpenAPI `info.version` bumps on any change.
