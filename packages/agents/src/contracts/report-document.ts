/**
 * Zod mirror of `contracts/report-document.schema.json` (frozen). The writer (model) and the numbers-only
 * fallback both produce this; the renderer and the app consume it.
 */
import { z } from 'zod';

export const CHART_TYPES = [
  'donut', 'daily_bars', 'stacked_in_out', 'trend_lines', 'top_bars', 'waterfall', 'calendar_heatmap',
  'budget_bullets', 'balance_sparkline', 'fee_meter',
] as const;
export const ChartTypeSchema = z.enum(CHART_TYPES);
export type ChartType = z.infer<typeof ChartTypeSchema>;

export const DELTA_DIRECTIONS = ['up', 'down', 'flat', 'na'] as const;

export const HeroSectionSchema = z.strictObject({
  type: z.literal('hero'),
  total_out: z.string(),
  delta: z.string(),
  delta_direction: z.enum(DELTA_DIRECTIONS),
  verdict: z.string().max(140),
  tally: z.array(z.object({ label: z.string(), value: z.string(), cents: z.number().int() })),
});
export const KpisSectionSchema = z.strictObject({
  type: z.literal('kpis'),
  items: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        delta: z.string().nullable().optional(),
        tone: z.enum(['in', 'out', 'fee', 'transfer', 'neutral']),
      }),
    )
    .max(4),
});
export const ChartSectionSchema = z.strictObject({
  type: z.literal('chart'),
  chart_id: z.string(),
  chart_type: ChartTypeSchema,
  title: z.string(),
  takeaway: z.string().nullable().optional(),
  data_ref: z.string(),
  alt_text: z.string(),
});
export const InsightsSectionSchema = z.strictObject({
  type: z.literal('insights'),
  title: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        insight_id: z.string(),
        headline: z.string().max(90),
        body: z.string().max(280),
        drilldown: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .max(12),
});
export const TableSectionSchema = z.strictObject({
  type: z.literal('table'),
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  numeric_columns: z.array(z.number().int()),
  total_row: z.array(z.string()).nullable().optional(),
});
export const ListSectionSchema = z.strictObject({
  type: z.literal('list'),
  title: z.string(),
  items: z.array(z.string()),
});
export const CalloutSectionSchema = z.strictObject({
  type: z.literal('callout'),
  tone: z.enum(['neutral', 'fee', 'warn']),
  body: z.string().max(300),
});
export const WatchSectionSchema = z.strictObject({
  type: z.literal('watch'),
  title: z.string(),
  items: z.array(z.string().max(160)).min(1).max(3),
});
export const FooterSectionSchema = z.strictObject({
  type: z.literal('footer'),
  accounts_covered: z.array(z.string()),
  computed_note: z.string(),
  unknown_count: z.string(),
});

export const SectionSchema = z.discriminatedUnion('type', [
  HeroSectionSchema,
  KpisSectionSchema,
  ChartSectionSchema,
  InsightsSectionSchema,
  TableSectionSchema,
  ListSectionSchema,
  CalloutSectionSchema,
  WatchSectionSchema,
  FooterSectionSchema,
]);
export type Section = z.infer<typeof SectionSchema>;
export type HeroSection = z.infer<typeof HeroSectionSchema>;
export type KpisSection = z.infer<typeof KpisSectionSchema>;
export type ChartSection = z.infer<typeof ChartSectionSchema>;
export type InsightsSection = z.infer<typeof InsightsSectionSchema>;
export type TableSection = z.infer<typeof TableSectionSchema>;
export type ListSection = z.infer<typeof ListSectionSchema>;
export type CalloutSection = z.infer<typeof CalloutSectionSchema>;
export type WatchSection = z.infer<typeof WatchSectionSchema>;
export type FooterSection = z.infer<typeof FooterSectionSchema>;

export const FactCheckSchema = z.strictObject({
  passed: z.boolean(),
  violations: z.array(z.string()),
  attempts: z.number().int(),
});
export type FactCheck = z.infer<typeof FactCheckSchema>;

export const ReportMetaSchema = z.strictObject({
  generated_at: z.iso.datetime({ offset: true }),
  facts_version: z.string(),
  writer: z.enum(['model', 'fallback']),
  model: z.string().nullable(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  cost_usd: z.number(),
  fact_check: FactCheckSchema,
});
export type ReportMeta = z.infer<typeof ReportMetaSchema>;

export const ReportDocumentSchema = z.strictObject({
  version: z.literal('1'),
  report_id: z.string(),
  kind: z.enum(['weekly', 'monthly']),
  locale: z.enum(['en', 'sw']),
  period_label: z.string(),
  title: z.string().max(80),
  sections: z.array(SectionSchema).min(3),
  whatsapp: z.strictObject({ caption: z.string().max(1000), hero_chart_ids: z.array(z.string()).max(1) }),
  email: z.strictObject({ subject: z.string().max(80), preheader: z.string().max(120) }),
  meta: ReportMetaSchema,
});
export type ReportDocument = z.infer<typeof ReportDocumentSchema>;
