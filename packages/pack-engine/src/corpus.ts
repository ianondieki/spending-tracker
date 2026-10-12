/**
 * Corpus runner shared by the CLI and the test-suite: reads corpus JSONL lines, runs each through the packs
 * whose sender IDs match, and summarises per-family counts and unknowns.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseWithPacks, senderMatches, type EngineOptions } from './engine.js';
import type { CompiledPack } from './loader.js';
import { PACKS_DIR } from './loader.js';
import { postProcess, type PostProcessResult } from './postprocess.js';
import type { ParsedTransaction, RawMessage } from './types.js';

/** Substituted for a corpus line without `received_at`, so the line still parses deterministically. */
export const UNKNOWN_RECEIVED_AT = '2000-01-01T00:00:00+03:00';

export const CORPUS_DIR = path.resolve(PACKS_DIR, '..', '..', 'corpus');

/** One line of a corpus JSONL file (see corpus/README.md §3). Extra keys are kept. */
export interface CorpusLine extends RawMessage {
  readonly provider?: string;
  readonly family_guess?: string;
  readonly sha256?: string;
  readonly source?: string;
  readonly unverified?: boolean;
  readonly illustrative?: boolean;
  readonly [key: string]: unknown;
}

export function readJsonl(file: string): CorpusLine[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const out: CorpusLine[] = [];
  lines.forEach((line, idx) => {
    if (line.trim().length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      throw new Error(`${file}:${idx + 1}: ${(e as Error).message}`, { cause: e });
    }
    const obj = parsed as Partial<CorpusLine> & { received_at?: string | null };
    if (typeof obj.sender !== 'string' || typeof obj.body !== 'string') {
      throw new Error(`${file}:${idx + 1}: needs sender and body`);
    }
    if (typeof obj.received_at !== 'string') {
      // Public samples copied from web pages may not record when they arrived.
      out.push({ ...obj, received_at: UNKNOWN_RECEIVED_AT } as CorpusLine);
      return;
    }
    out.push(obj as CorpusLine);
  });
  return out;
}

export interface UnknownMessage {
  readonly index: number;
  readonly line: CorpusLine;
  readonly raw_hash: string;
}

export interface CorpusRunResult {
  readonly total: number;
  readonly not_ours: number;
  readonly parsed: number;
  readonly ignored: number;
  readonly unknown: UnknownMessage[];
  readonly per_family: Map<string, number>;
  readonly items: ParsedTransaction[];
  readonly post: PostProcessResult;
}

export function runCorpus(packs: readonly CompiledPack[], lines: readonly CorpusLine[], options?: EngineOptions): CorpusRunResult {
  const perFamily = new Map<string, number>();
  const unknown: UnknownMessage[] = [];
  const items: ParsedTransaction[] = [];
  let notOurs = 0;
  let parsed = 0;
  let ignored = 0;
  lines.forEach((line, index) => {
    const outcome = parseWithPacks(packs, line, options);
    switch (outcome.kind) {
      case 'not_ours':
        notOurs += 1;
        break;
      case 'unknown':
        unknown.push({ index, line, raw_hash: outcome.raw_hash });
        break;
      case 'ignored':
        ignored += 1;
        perFamily.set(outcome.family_id, (perFamily.get(outcome.family_id) ?? 0) + 1);
        break;
      case 'parsed':
        parsed += 1;
        perFamily.set(outcome.family_id, (perFamily.get(outcome.family_id) ?? 0) + 1);
        items.push({ transaction: outcome.transaction, family_id: outcome.family_id, is_transfer_hint: outcome.is_transfer_hint });
        break;
    }
  });
  return { total: lines.length, not_ours: notOurs, parsed, ignored, unknown, per_family: perFamily, items, post: postProcess(items) };
}

/** Which of the loaded packs claims a corpus line's sender, if any. */
export function packForSender(packs: readonly CompiledPack[], sender: string): CompiledPack | null {
  return packs.find((p) => senderMatches(p, sender)) ?? null;
}

/**
 * A corpus message that no family parses is acceptable only when the provider's `MISSING-FAMILIES.md` lists the
 * first 12 hex characters of its `sha256` (the corpus line's own field, or the hash of the body when absent). An
 * `illustrative: true` line (a template a web page presented, not a message) is reported but never fails.
 */
export function isAllowedUnknown(missingFamiliesText: string, u: UnknownMessage): boolean {
  if (u.line.illustrative === true) return true;
  const sha = typeof u.line.sha256 === 'string' ? u.line.sha256 : u.raw_hash;
  return missingFamiliesText.includes(sha.slice(0, 12));
}
