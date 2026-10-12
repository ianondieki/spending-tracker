import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson, dumpAll, dumpTargets, EXPECTED_DIR } from './dump.js';
import { loadAllPacks } from './loader.js';

describe('cross-engine dumps', () => {
  const packs = loadAllPacks();
  const dumps = dumpAll(packs);

  it('canonical JSON sorts keys recursively and uses no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: null, c: [2, { z: 'x', y: true }] } })).toBe(
      '{"a":{"c":[2,{"y":true,"z":"x"}],"d":null},"b":1}',
    );
  });

  it('covers every corpus file and the demo inbox', () => {
    const outputs = dumpTargets().map((t) => t.output);
    expect(outputs).toContain('mpesa/unverified-public-samples.expected.jsonl');
    expect(outputs).toContain('demo-inbox.expected.jsonl');
    expect(outputs.some((o) => o.startsWith('expected/'))).toBe(false);
  });

  for (const [rel, content] of dumps) {
    it(`${rel} matches the committed file (run \`pnpm dump\` after changing a pack or the engine)`, () => {
      const committed = readFileSync(path.join(EXPECTED_DIR, rel), 'utf8');
      expect(content).toBe(committed);
    });
  }

  it('is deterministic across runs', () => {
    const again = dumpAll(packs);
    for (const [rel, content] of dumps) expect(again.get(rel)).toBe(content);
  });

  it('writes one line per input message in input order', () => {
    for (const target of dumpTargets()) {
      const inputLines = readFileSync(path.join(EXPECTED_DIR, '..', target.input), 'utf8')
        .split('\n')
        .filter((l) => l.trim()).length;
      const outputLines = dumps
        .get(target.output)!
        .split('\n')
        .filter((l) => l.trim());
      expect(outputLines).toHaveLength(inputLines);
      outputLines.forEach((line, i) =>
        expect((JSON.parse(line) as { index: number }).index).toBe(i),
      );
    }
  });
});
