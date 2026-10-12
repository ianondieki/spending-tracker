/**
 * What the model sees of a FactsSheet: everything except drill-down filters, balance series and transaction
 * ids, which carry no meaning for writing and only cost tokens. Key order follows the sheet, so the same sheet
 * always serialises to the same text.
 */
import { type CandidateInsight, type FactsSheet } from '@hesabu/analytics';

const DROP_KEYS = new Set(['drilldown', 'balance_series', 'transaction_ids', 'display_strings', 'candidate_insights']);

export function compactFactsJson(facts: FactsSheet): string {
  return JSON.stringify(facts, (key, value: unknown) => (DROP_KEYS.has(key) ? undefined : value));
}

export function candidatesJson(candidates: readonly CandidateInsight[]): string {
  return JSON.stringify(candidates.map((c) => ({ id: c.id, kind: c.kind, severity: c.severity, params: c.params })));
}
