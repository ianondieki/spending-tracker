/**
 * Model judge for evals: scores a finished report for clarity, usefulness, tone and language. It never blocks
 * or changes delivery; the pipeline only records the verdict.
 */
import { type FactsSheet } from '@hesabu/analytics';
import { z } from 'zod';

import { type ReportDocument } from './contracts/report-document.js';
import { type Usage } from './cost.js';
import { type FailureReason, type ModelClient } from './model-client.js';
import { dataBlock } from './prompts/common.js';
import { JUDGE_V1 } from './prompts/judge.v1.js';

const Score = z.number().int().min(1).max(5);

export const JudgeVerdictSchema = z.strictObject({
  clarity: Score,
  usefulness: Score,
  tone: Score,
  language: Score,
  pass: z.boolean(),
  notes: z.string(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export type JudgeResult =
  | {
      readonly ok: true;
      readonly verdict: JudgeVerdict;
      readonly usage: Usage;
      readonly model: string;
    }
  | {
      readonly ok: false;
      readonly reason: FailureReason;
      readonly usage?: Usage;
      readonly model?: string;
    };

export function buildJudgeUser(doc: ReportDocument, facts: FactsSheet): string {
  const { meta: _meta, ...report } = doc;
  return [
    `Locale: ${doc.locale}`,
    `Report kind: ${doc.kind}`,
    '',
    dataBlock('allowed_numbers', JSON.stringify(facts.display_strings)),
    dataBlock('report', JSON.stringify(report)),
  ].join('\n');
}

/** Never throws; a failure is returned as `ok: false` and the report goes out regardless. */
export async function judgeReport(
  doc: ReportDocument,
  facts: FactsSheet,
  client: ModelClient,
): Promise<JudgeResult> {
  try {
    const result = await client.structured({
      step: 'judge',
      system: JUDGE_V1.system,
      user: buildJudgeUser(doc, facts),
      schema: JudgeVerdictSchema,
      effort: 'low',
    });
    if (!result.ok) {
      return result.usage === undefined
        ? { ok: false, reason: result.reason }
        : {
            ok: false,
            reason: result.reason,
            usage: result.usage,
            ...(result.model === undefined ? {} : { model: result.model }),
          };
    }
    return { ok: true, verdict: result.value, usage: result.usage, model: result.model };
  } catch {
    return { ok: false, reason: 'api_error' };
  }
}
