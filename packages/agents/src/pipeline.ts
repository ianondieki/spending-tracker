/**
 * One report, end to end: budget check → insight-select → write → fact-check (one regenerate with the
 * problems attached) → numbers-only fallback on anything else. Deterministic code with model steps; the
 * fallback is always available and always ships.
 */
import { type FactsSheet } from '@hesabu/analytics';
import { type Locale } from '@hesabu/i18n';

import {
  type ReportDocument,
  ReportDocumentSchema,
  type ReportMeta,
} from './contracts/report-document.js';
import {
  addUsage,
  type BudgetGuard,
  type CostLedger,
  costEntry,
  estimateCostUsd,
  roundUsd,
  type Usage,
  ZERO_USAGE,
} from './cost.js';
import { DEFAULT_MODEL } from './env.js';
import { type ReportKind, writeFallback } from './fallback-writer.js';
import { insightSelect, type SelectionResult } from './insight-select.js';
import { judgeReport, type JudgeResult } from './judge.js';
import { type FailureReason, type ModelClient } from './model-client.js';
import { assembleDocument, checkDraft, writeReport } from './write.js';

export const MAX_WRITE_ATTEMPTS = 2;

export interface PipelineContext {
  readonly report_id: string;
  readonly kind: ReportKind;
  readonly baseUrl?: string;
}

export interface PipelineDeps {
  readonly client: ModelClient;
  readonly guard: BudgetGuard;
  /** Where per-call costs are recorded when the client does not record them itself. */
  readonly ledger?: CostLedger;
  readonly locale: Locale;
  readonly now: Date;
  /** Run the eval judge on a model-written report and return its verdict (never blocks delivery). */
  readonly runJudge?: boolean;
}

export interface WriteAttempt {
  readonly violations: string[];
  readonly failure?: FailureReason | 'schema';
}

export type FallbackReason =
  'budget' | 'selection_unavailable' | 'write_failed' | 'schema_invalid' | 'fact_check_failed';

export interface PipelineResult {
  readonly document: ReportDocument;
  readonly writer: 'model' | 'fallback';
  readonly usage: Usage;
  readonly cost_usd: number;
  readonly selection: SelectionResult | null;
  readonly attempts: WriteAttempt[];
  readonly fallback_reason: FallbackReason | null;
  readonly judge: JudgeResult | null;
}

/** Input tokens recorded in meta include cached reads and cache writes (everything the model read). */
function metaTokens(usage: Usage): { input_tokens: number; output_tokens: number } {
  return {
    input_tokens:
      usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
    output_tokens: usage.output_tokens,
  };
}

export async function produceReport(
  facts: FactsSheet,
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const reportCtx = { ...ctx, locale: deps.locale, now: deps.now };
  let usage: Usage = ZERO_USAGE;
  let cost = 0;
  const attempts: WriteAttempt[] = [];
  let selection: SelectionResult | null = null;

  const account = async (
    step: string,
    r: { usage?: Usage | null; model?: string | null },
  ): Promise<void> => {
    if (r.usage === undefined || r.usage === null) return;
    const model = r.model ?? DEFAULT_MODEL;
    usage = addUsage(usage, r.usage);
    cost += estimateCostUsd(model, r.usage);
    if (deps.client.recordsCost !== true && deps.ledger !== undefined) {
      await deps.ledger.record(costEntry(step, model, r.usage, deps.now));
    }
  };

  const fallback = (reason: FallbackReason): PipelineResult => {
    const insightIds =
      selection?.source === 'model' ? selection.selected.map((s) => s.id) : undefined;
    const doc = writeFallback(facts, {
      ...reportCtx,
      ...(insightIds === undefined ? {} : { insightIds }),
    });
    const document: ReportDocument = {
      ...doc,
      meta: {
        ...doc.meta,
        ...metaTokens(usage),
        cost_usd: roundUsd(cost),
        fact_check: { ...doc.meta.fact_check, attempts: attempts.length },
      },
    };
    return {
      document,
      writer: 'fallback',
      usage,
      cost_usd: roundUsd(cost),
      selection,
      attempts,
      fallback_reason: reason,
      judge: null,
    };
  };

  if (!(await deps.guard.canSpend(deps.now))) return fallback('budget');

  selection = await insightSelect(facts, ctx.kind, deps.client);
  await account('insight-select', selection);
  if (selection.failure === 'budget' || selection.failure === 'disabled')
    return fallback('selection_unavailable');
  const selectedIds = selection.selected.map((s) => s.id);

  let problems: string[] = [];
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    if (!(await deps.guard.canSpend(deps.now))) return fallback('budget');
    const written = await writeReport(
      facts,
      selectedIds,
      reportCtx,
      deps.client,
      attempt > 1 ? { previousProblems: problems } : {},
    );
    await account('write', written);
    if (!written.ok) {
      attempts.push({ violations: [], failure: written.reason });
      return fallback('write_failed');
    }

    const check = checkDraft(written.draft, facts, selectedIds, reportCtx);
    problems = check.problems;
    const meta: ReportMeta = {
      generated_at: deps.now.toISOString(),
      facts_version: facts.version,
      writer: 'model',
      model: written.model,
      ...metaTokens(usage),
      cost_usd: roundUsd(cost),
      fact_check: {
        passed: check.factViolations.length === 0,
        violations: check.factViolations,
        attempts: attempt,
      },
    };
    const assembled = assembleDocument(written.draft, facts, reportCtx, meta);
    const valid = ReportDocumentSchema.safeParse(assembled);
    if (!valid.success) {
      attempts.push({
        violations: valid.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`),
        failure: 'schema',
      });
      return fallback('schema_invalid');
    }
    attempts.push({ violations: problems });
    if (problems.length > 0) continue;

    let document = valid.data;
    let judge: JudgeResult | null = null;
    if (deps.runJudge === true) {
      judge = await judgeReport(document, facts, deps.client);
      await account('judge', judge);
      document = {
        ...document,
        meta: { ...document.meta, ...metaTokens(usage), cost_usd: roundUsd(cost) },
      };
    }
    return {
      document,
      writer: 'model',
      usage,
      cost_usd: roundUsd(cost),
      selection,
      attempts,
      fallback_reason: null,
      judge,
    };
  }
  return fallback('fact_check_failed');
}
