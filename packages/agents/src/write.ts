/**
 * Step 3: the model writes the report document from the facts and the selected insights. Its output is the
 * document without `meta`, without the identity fields (version, report_id, kind, locale) and without insight
 * drill-downs: code sets those, so the model can neither spoof an id nor invent a drill-down.
 */
import { type FactsSheet } from '@hesabu/analytics';
import { z } from 'zod';

import {
  CalloutSectionSchema,
  ChartSectionSchema,
  FooterSectionSchema,
  HeroSectionSchema,
  KpisSectionSchema,
  ListSectionSchema,
  type ReportDocument,
  type ReportMeta,
  TableSectionSchema,
  WatchSectionSchema,
} from './contracts/report-document.js';
import { type Usage } from './cost.js';
import { factCheck } from './fact-check.js';
import { CHART_CATALOGUE, periodLabel, type ReportContext } from './fallback-writer.js';
import { type FailureReason, type ModelClient } from './model-client.js';
import { candidatesJson, compactFactsJson } from './prompt-data.js';
import { dataBlock } from './prompts/common.js';
import { WRITE_V1 } from './prompts/write.v1.js';

export const DraftInsightsSectionSchema = z.strictObject({
  type: z.literal('insights'),
  title: z.string().nullable().optional(),
  items: z
    .array(z.strictObject({ insight_id: z.string(), headline: z.string().max(90), body: z.string().max(280) }))
    .max(12),
});

export const DraftSectionSchema = z.discriminatedUnion('type', [
  HeroSectionSchema,
  KpisSectionSchema,
  ChartSectionSchema,
  DraftInsightsSectionSchema,
  TableSectionSchema,
  ListSectionSchema,
  CalloutSectionSchema,
  WatchSectionSchema,
  FooterSectionSchema,
]);

/** ReportDocument minus `meta` (and minus the identity fields and drill-downs that code fills). */
export const ReportDraftSchema = z.strictObject({
  period_label: z.string(),
  title: z.string().max(80),
  sections: z.array(DraftSectionSchema).min(3),
  whatsapp: z.strictObject({ caption: z.string().max(1000), hero_chart_ids: z.array(z.string()).max(1) }),
  email: z.strictObject({ subject: z.string().max(80), preheader: z.string().max(120) }),
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

export type WriteResult =
  | { readonly ok: true; readonly draft: ReportDraft; readonly usage: Usage; readonly model: string }
  | {
      readonly ok: false;
      readonly reason: FailureReason;
      readonly detail?: string;
      readonly usage?: Usage;
      readonly model?: string;
    };

export interface WriteOptions {
  /** Problems found in the previous draft; the model is asked to fix every one. */
  readonly previousProblems?: readonly string[];
}

export function buildWriteUser(
  facts: FactsSheet,
  selectedIds: readonly string[],
  ctx: Pick<ReportContext, 'kind' | 'locale'>,
  opts: WriteOptions = {},
): string {
  const byId = new Map(facts.candidate_insights.map((c) => [c.id, c]));
  const selected = selectedIds.map((id) => byId.get(id)).filter((c) => c !== undefined);
  const lines = [
    `Report kind: ${ctx.kind}`,
    `Locale: ${ctx.locale}`,
    `Selected insight ids, in order: ${JSON.stringify(selectedIds)}`,
    '',
    dataBlock('period_label', periodLabel(facts, ctx.locale)),
    dataBlock('selected_insights', candidatesJson(selected)),
    dataBlock('allowed_numbers', JSON.stringify(facts.display_strings)),
    dataBlock('facts', compactFactsJson(facts)),
  ];
  if (opts.previousProblems !== undefined && opts.previousProblems.length > 0) {
    lines.push(
      '',
      'Your previous draft failed the checks listed in the problems block. Write the whole document again and fix every one.',
      dataBlock('problems', opts.previousProblems.map((p) => `- ${p}`).join('\n')),
    );
  }
  return lines.join('\n');
}

export async function writeReport(
  facts: FactsSheet,
  selectedIds: readonly string[],
  ctx: ReportContext,
  client: ModelClient,
  opts: WriteOptions = {},
): Promise<WriteResult> {
  const result = await client.structured({
    step: 'write',
    system: WRITE_V1.system,
    user: buildWriteUser(facts, selectedIds, ctx, opts),
    schema: ReportDraftSchema,
    effort: 'medium',
  });
  if (!result.ok) return result;
  return { ok: true, draft: result.value, usage: result.usage, model: result.model };
}

/** Structural problems the schema cannot express: unknown insight ids, unknown charts, a wrong period label. */
export function structuralProblems(
  draft: ReportDraft,
  facts: FactsSheet,
  selectedIds: readonly string[],
  ctx: Pick<ReportContext, 'locale'>,
): string[] {
  const problems: string[] = [];
  const selected = new Set(selectedIds);
  const used = new Set<string>();
  const chartIds = new Set<string>();
  const expectedLabel = periodLabel(facts, ctx.locale);
  if (draft.period_label !== expectedLabel) problems.push(`period_label: must be exactly the period label given`);
  draft.sections.forEach((section, i) => {
    if (section.type === 'insights') {
      section.items.forEach((item, j) => {
        if (!selected.has(item.insight_id)) problems.push(`sections[${i}].insights.items[${j}]: insight_id is not one of the selected ids`);
        else if (used.has(item.insight_id)) problems.push(`sections[${i}].insights.items[${j}]: insight_id used twice`);
        used.add(item.insight_id);
      });
    } else if (section.type === 'chart') {
      const entry = CHART_CATALOGUE[section.chart_id];
      if (entry === undefined) problems.push(`sections[${i}].chart: unknown chart_id`);
      else if (entry.type !== section.chart_type || entry.data_ref !== section.data_ref) {
        problems.push(`sections[${i}].chart(${section.chart_id}): chart_type and data_ref must match the catalogue`);
      }
      chartIds.add(section.chart_id);
    }
  });
  if (!draft.sections.some((s) => s.type === 'hero')) problems.push('sections: a hero section is required');
  for (const id of draft.whatsapp.hero_chart_ids) {
    if (!chartIds.has(id)) problems.push(`whatsapp.hero_chart_ids: no chart section with that id`);
  }
  return problems;
}

/** Fact-check violations plus structural problems; empty means the draft may ship. */
export function checkDraft(
  draft: ReportDraft,
  facts: FactsSheet,
  selectedIds: readonly string[],
  ctx: Pick<ReportContext, 'locale'>,
): { factViolations: string[]; problems: string[] } {
  const factViolations = factCheck(draft, facts).violations;
  return { factViolations, problems: [...factViolations, ...structuralProblems(draft, facts, selectedIds, ctx)] };
}

/** Fills identity fields, insight drill-downs (from the engine's candidates) and meta. */
export function assembleDocument(draft: ReportDraft, facts: FactsSheet, ctx: ReportContext, meta: ReportMeta): ReportDocument {
  const drilldowns = new Map(facts.candidate_insights.map((c) => [c.id, c.drilldown]));
  return {
    version: '1',
    report_id: ctx.report_id,
    kind: ctx.kind,
    locale: ctx.locale,
    period_label: draft.period_label,
    title: draft.title,
    sections: draft.sections.map((section) =>
      section.type === 'insights'
        ? { ...section, items: section.items.map((item) => ({ ...item, drilldown: drilldowns.get(item.insight_id) ?? null })) }
        : section,
    ),
    whatsapp: draft.whatsapp,
    email: draft.email,
    meta,
  };
}
