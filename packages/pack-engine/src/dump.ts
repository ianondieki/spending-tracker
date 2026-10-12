/**
 * Cross-engine parity dumps: every corpus file and the demo inbox, run through the packs, written as canonical JSONL
 * (one line per input message, in input order, keys sorted, no whitespace). Lane A's Kotlin engine must produce
 * byte-identical files; `dump.test.ts` fails when the committed files drift from this engine's output.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CORPUS_DIR, readJsonl, runCorpus, UNKNOWN_RECEIVED_AT } from './corpus.js';
import { DEMO_VARIABLES } from './demo/generate.js';
import { parseWithPacks, type EngineOptions } from './engine.js';
import { EXAMPLE_VARIABLES } from './examples.js';
import type { CompiledPack } from './loader.js';
import { dedupe } from './postprocess.js';
import type { ParsedTransaction } from './types.js';

export const EXPECTED_DIR = path.join(CORPUS_DIR, 'expected');
/** Variables both engines must use when dumping: corpus files get these, the demo inbox gets DEMO_VARIABLES. */
export const DUMP_VARIABLES = EXAMPLE_VARIABLES;

export interface DumpTarget {
  /** Path of the input JSONL relative to corpus/. */
  readonly input: string;
  /** Path of the expected JSONL relative to corpus/expected/. */
  readonly output: string;
  readonly variables: Readonly<Record<string, string>>;
}

/** Every corpus file except the demo folder, plus the demo inbox. Sorted, so the output set is deterministic. */
export function dumpTargets(corpusDir: string = CORPUS_DIR): DumpTarget[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== path.join(corpusDir, 'expected') && full !== path.join(corpusDir, 'demo'))
          walk(full);
      } else if (entry.name.endsWith('.jsonl')) files.push(full);
    }
  };
  walk(corpusDir);
  const targets: DumpTarget[] = files.map((f) => {
    const rel = path.relative(corpusDir, f).split(path.sep).join('/');
    return {
      input: rel,
      output: rel.replace(/\.jsonl$/, '.expected.jsonl'),
      variables: DUMP_VARIABLES,
    };
  });
  const demo = path.join(corpusDir, 'demo', 'demo-inbox.jsonl');
  if (existsSync(demo))
    targets.push({
      input: 'demo/demo-inbox.jsonl',
      output: 'demo-inbox.expected.jsonl',
      variables: DEMO_VARIABLES,
    });
  return targets;
}

/** JSON with keys sorted recursively and no whitespace: the only serialisation both engines can match byte for byte. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Produces the dump for one input file. */
export function dumpFile(
  packs: readonly CompiledPack[],
  inputPath: string,
  variables: Readonly<Record<string, string>>,
): string {
  const lines = readJsonl(inputPath);
  const options: EngineOptions = { variables };
  const result = runCorpus(packs, lines, options);
  const keptIds = new Set(dedupe(result.items).kept.map((k) => k.transaction.id));
  const byIndex = new Map<number, ParsedTransaction>();
  // runCorpus keeps items in input order; re-derive each item's input index by replaying the outcomes.
  let cursor = 0;
  lines.forEach((line, index) => {
    const outcome = parseWithPacks(packs, line, options);
    if (outcome.kind === 'parsed') {
      byIndex.set(index, result.items[cursor]!);
      cursor += 1;
    }
  });
  const seen = new Set<string>();
  const out: string[] = [];
  lines.forEach((line, index) => {
    const outcome = parseWithPacks(packs, line, options);
    const base = {
      index,
      sender: line.sender,
      received_at: line.received_at === UNKNOWN_RECEIVED_AT ? null : line.received_at,
    };
    switch (outcome.kind) {
      case 'not_ours':
        out.push(canonicalJson({ ...base, outcome: 'not_ours' }));
        break;
      case 'unknown':
        out.push(canonicalJson({ ...base, outcome: 'unknown', raw_hash: outcome.raw_hash }));
        break;
      case 'ignored':
        out.push(
          canonicalJson({
            ...base,
            outcome: 'ignored',
            family_id: outcome.family_id,
            raw_hash: outcome.raw_hash,
            amount_cents: outcome.fields.amount_cents,
            balance_after_cents: outcome.fields.balance_after_cents,
            occurred_at: outcome.fields.occurred_at,
            external_ref: outcome.fields.external_ref,
          }),
        );
        break;
      case 'parsed': {
        const t = byIndex.get(index)!.transaction;
        const duplicate = seen.has(t.id) || !keptIds.has(t.id);
        seen.add(t.id);
        out.push(
          canonicalJson({
            ...base,
            outcome: duplicate ? 'duplicate' : 'parsed',
            id: t.id,
            account_ref: t.account_ref,
            provider: t.provider,
            external_ref: t.external_ref,
            family_id: t.parser.family_id,
            pack_id: t.parser.pack_id,
            pack_version: t.parser.pack_version,
            type: t.type,
            direction: t.direction,
            amount_cents: t.amount_cents,
            fee_cents: t.fee_cents,
            balance_after_cents: t.balance_after_cents,
            occurred_at: t.occurred_at,
            counterparty: t.counterparty,
            is_transfer: duplicate ? false : t.is_transfer,
            transfer_pair_id: duplicate ? null : t.transfer_pair_id,
            parse_confidence: t.parse_confidence,
            raw_hash: t.raw_hash,
            note: t.note,
          }),
        );
        break;
      }
    }
  });
  return `${out.join('\n')}\n`;
}

export function dumpAll(
  packs: readonly CompiledPack[],
  corpusDir: string = CORPUS_DIR,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const target of dumpTargets(corpusDir))
    result.set(
      target.output,
      dumpFile(packs, path.join(corpusDir, target.input), target.variables),
    );
  return result;
}

export function writeDumps(
  dumps: Map<string, string>,
  expectedDir: string = EXPECTED_DIR,
): string[] {
  const written: string[] = [];
  for (const [rel, content] of dumps) {
    const full = path.join(expectedDir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
    written.push(full);
  }
  return written;
}
