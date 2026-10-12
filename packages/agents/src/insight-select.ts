/**
 * Step 2 of the report workflow: the model ranks the engine's candidate insights and picks at most 7 (weekly)
 * or 12 (monthly). It cannot add facts: unknown or repeated ids are dropped. Any failure falls back to the
 * engine's own order, truncated.
 */
import { type FactsSheet } from '@hesabu/analytics';
import { z } from 'zod';

import { type Usage } from './cost.js';
import { MAX_INSIGHTS, type ReportKind } from './fallback-writer.js';
import { type FailureReason, type ModelClient } from './model-client.js';
import { candidatesJson } from './prompt-data.js';
import { dataBlock } from './prompts/common.js';
import { INSIGHT_SELECT_V1 } from './prompts/insight-select.v1.js';

export const InsightSelectionSchema = z.strictObject({
  selected: z.array(z.strictObject({ id: z.string(), rationale: z.string() })),
});
export type InsightSelection = z.infer<typeof InsightSelectionSchema>;
export type SelectedInsight = InsightSelection['selected'][number];

export interface SelectionResult {
  readonly selected: SelectedInsight[];
  readonly source: 'model' | 'fallback';
  readonly usage: Usage | null;
  readonly model: string | null;
  /** Why the engine order was used, when it was. */
  readonly failure?: FailureReason | 'empty';
}

export function engineOrder(facts: FactsSheet, kind: ReportKind): SelectedInsight[] {
  return facts.candidate_insights
    .slice(0, MAX_INSIGHTS[kind])
    .map((c) => ({ id: c.id, rationale: 'engine order' }));
}

export function buildSelectUser(facts: FactsSheet, kind: ReportKind): string {
  const summary = {
    kind,
    period: facts.period.label_en,
    out: facts.totals.out.display,
    out_delta: facts.deltas.out.display,
    in: facts.totals.in.display,
    fees: facts.totals.fees.display,
  };
  return [
    `Report kind: ${kind}`,
    `Maximum insights to select: ${MAX_INSIGHTS[kind]}`,
    '',
    dataBlock('summary', JSON.stringify(summary)),
    dataBlock('candidates', candidatesJson(facts.candidate_insights)),
  ].join('\n');
}

export async function insightSelect(
  facts: FactsSheet,
  kind: ReportKind,
  client: ModelClient,
): Promise<SelectionResult> {
  if (facts.candidate_insights.length === 0) {
    return { selected: [], source: 'fallback', usage: null, model: null, failure: 'empty' };
  }
  const result = await client.structured({
    step: 'insight-select',
    system: INSIGHT_SELECT_V1.system,
    user: buildSelectUser(facts, kind),
    schema: InsightSelectionSchema,
    effort: 'low',
  });
  if (!result.ok) {
    return {
      selected: engineOrder(facts, kind),
      source: 'fallback',
      usage: result.usage ?? null,
      model: result.model ?? null,
      failure: result.reason,
    };
  }
  const known = new Set(facts.candidate_insights.map((c) => c.id));
  const seen = new Set<string>();
  const selected: SelectedInsight[] = [];
  for (const item of result.value.selected) {
    if (!known.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    selected.push({ id: item.id, rationale: item.rationale.slice(0, 200) });
    if (selected.length >= MAX_INSIGHTS[kind]) break;
  }
  if (selected.length === 0) {
    return {
      selected: engineOrder(facts, kind),
      source: 'fallback',
      usage: result.usage,
      model: result.model,
      failure: 'empty',
    };
  }
  return { selected, source: 'model', usage: result.usage, model: result.model };
}
