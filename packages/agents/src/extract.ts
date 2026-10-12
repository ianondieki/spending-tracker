/**
 * Unknown-message extractor: proposes a structured transaction for each message the deterministic parsers
 * could not read. Input is redacted on the phone and redacted again here before it is sent (P2, belt and
 * braces). It only proposes; nothing is written, and a person reviews every proposal.
 */
import { COUNTERPARTY_KINDS, TX_TYPES } from '@hesabu/analytics';
import { z } from 'zod';

import { addUsage, type Usage, ZERO_USAGE } from './cost.js';
import { type ModelClient } from './model-client.js';
import { dataBlock } from './prompts/common.js';
import { EXTRACT_V1 } from './prompts/extract.v1.js';
import { redact } from './redact.js';

export interface UnknownMessage {
  readonly sender: string;
  readonly body_redacted: string;
  readonly received_at: string;
}

export const ExtractionProposalSchema = z.strictObject({
  index: z.number().int().min(0),
  type: z.enum(TX_TYPES),
  direction: z.enum(['in', 'out', 'none']),
  amount_cents: z.number().int().min(0),
  fee_cents: z.number().int().min(0),
  counterparty_name: z.string().nullable(),
  counterparty_kind: z.enum(COUNTERPARTY_KINDS),
  occurred_at: z.iso.datetime({ offset: true }).nullable(),
  confidence: z.number().min(0).max(1),
});
export type ExtractionProposal = z.infer<typeof ExtractionProposalSchema>;

export const ExtractionSchema = z.strictObject({ proposals: z.array(ExtractionProposalSchema) });

export interface ExtractionResult {
  readonly proposals: ExtractionProposal[];
  readonly usage: Usage;
}

export const EXTRACT_BATCH_SIZE = 20;

export function buildExtractUser(items: readonly UnknownMessage[], offset: number): string {
  const payload = items.map((item, i) => ({
    index: offset + i,
    sender: redact(item.sender),
    received_at: item.received_at,
    body: redact(item.body_redacted),
  }));
  return [
    'Timezone: Africa/Nairobi (+03:00). Currency: KES.',
    dataBlock('messages', JSON.stringify(payload)),
  ].join('\n');
}

/**
 * Proposals for each batch of messages. A batch whose call fails contributes nothing (and so the whole result
 * is `{ proposals: [] }` when the client fails). Proposals for indexes outside the batch, and repeats, are
 * dropped.
 */
export async function extractUnknownMessages(items: readonly UnknownMessage[], client: ModelClient): Promise<ExtractionResult> {
  const proposals: ExtractionProposal[] = [];
  let usage = ZERO_USAGE;
  for (let offset = 0; offset < items.length; offset += EXTRACT_BATCH_SIZE) {
    const batch = items.slice(offset, offset + EXTRACT_BATCH_SIZE);
    const result = await client.structured({
      step: 'extract',
      system: EXTRACT_V1.system,
      user: buildExtractUser(batch, offset),
      schema: ExtractionSchema,
      effort: 'medium',
    });
    if (result.usage !== undefined) usage = addUsage(usage, result.usage);
    if (!result.ok) continue;
    const seen = new Set(proposals.map((p) => p.index));
    for (const p of result.value.proposals) {
      if (p.index < offset || p.index >= offset + batch.length || seen.has(p.index)) continue;
      seen.add(p.index);
      proposals.push(p);
    }
  }
  return { proposals, usage };
}
