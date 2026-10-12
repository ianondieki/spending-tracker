/**
 * Examples are the tests (PROVIDER-PACKS.md): every example of every pack in contracts/provider-packs must parse to
 * its own family with its expected fields, and every corpus file must parse with no unknown message that the
 * provider's MISSING-FAMILIES.md does not list.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CORPUS_DIR, isAllowedUnknown, readJsonl, runCorpus } from './corpus.js';
import { EXAMPLE_VARIABLES, runExamples } from './examples.js';
import { loadAllPacks } from './loader.js';
import { compilePortableRegex } from './regex.js';

const packs = loadAllPacks();

describe('provider packs', () => {
  it('loads at least the M-Pesa pack', () => {
    expect(packs.map((p) => p.pack.pack_id)).toContain('mpesa');
  });

  for (const pack of packs) {
    describe(pack.pack.pack_id, () => {
      it('passes every family example', () => {
        const failures = runExamples(pack);
        expect(failures.map((f) => `${f.family_id}[${f.example_index}]: ${f.problem}`)).toEqual([]);
      });

      it('marks no example verified without a real export in corpus/', () => {
        // Until a `source: sms-backup-xml` file exists for the provider, every example must stay verified: false.
        const realExports = corpusFilesFor(pack.pack.provider).filter((f) =>
          readJsonl(f).some((l) => l.source === 'sms-backup-xml'),
        );
        if (realExports.length === 0) {
          for (const c of pack.families) {
            for (const ex of c.family.examples)
              expect(ex.verified, `${c.family.family_id}: ${ex.body.slice(0, 40)}`).toBe(false);
          }
        }
      });

      it('anchors every amount to a label (three-amounts rule)', () => {
        for (const c of pack.families) {
          for (const [group, spec] of Object.entries(c.family.fields)) {
            if (spec.normalise !== 'amount') continue;
            const idx = c.family.pattern.indexOf(`(?<${group}>`);
            const before = c.family.pattern.slice(Math.max(0, idx - 60), idx);
            expect(
              /[A-Za-z]{3,}/.test(before),
              `${c.family.family_id}: group ${group} has no label before it`,
            ).toBe(true);
          }
        }
      });

      it('has distinct examples that do not match an earlier family', () => {
        const bodies = new Set<string>();
        for (const c of pack.families) {
          for (const ex of c.family.examples) {
            expect(bodies.has(ex.body), `duplicate example body in ${c.family.family_id}`).toBe(
              false,
            );
            bodies.add(ex.body);
          }
        }
      });

      it('compiles every pattern under the portable subset', () => {
        for (const c of pack.families)
          expect(() => compilePortableRegex(c.family.pattern)).not.toThrow();
      });
    });
  }
});

function corpusFilesFor(provider: string): string[] {
  const dirs =
    provider === 'bank' || provider === 'card'
      ? ['banks']
      : provider === 'airtel_money'
        ? ['airtel-money']
        : [provider];
  const files: string[] = [];
  for (const d of dirs) {
    const dir = path.join(CORPUS_DIR, d);
    if (!existsSync(dir)) continue;
    walk(dir, files);
  }
  return files;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.jsonl')) out.push(full);
  }
}

describe('corpus', () => {
  const allFiles: string[] = [];
  walk(CORPUS_DIR, allFiles);
  const corpusFiles = allFiles.filter((f) => !f.includes(`${path.sep}demo${path.sep}`));
  it('has corpus files', () => {
    expect(corpusFiles.length).toBeGreaterThan(0);
  });

  for (const file of corpusFiles) {
    const rel = path.relative(CORPUS_DIR, file);
    it(`${rel}: every message from a known sender parses or is listed in MISSING-FAMILIES.md`, () => {
      const lines = readJsonl(file);
      const result = runCorpus(packs, lines, { variables: EXAMPLE_VARIABLES });
      const providerDir = path.join(CORPUS_DIR, rel.split(path.sep)[0]!);
      const missingPath = path.join(providerDir, 'MISSING-FAMILIES.md');
      const missing = existsSync(missingPath) ? readFileSync(missingPath, 'utf8') : '';
      const offenders = result.unknown.filter((u) => !isAllowedUnknown(missing, u));
      expect(
        offenders.map(
          (u) =>
            `line ${u.index + 1} (${u.line.family_guess ?? '?'}; sha ${(u.line.sha256 ?? u.raw_hash).slice(0, 12)}): ${u.line.body}`,
        ),
      ).toEqual([]);
    });
  }
});
