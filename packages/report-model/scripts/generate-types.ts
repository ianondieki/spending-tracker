// Generates src/generated/*.ts from the frozen contract schemas. Run with `pnpm gen`; the output is committed so
// consumers (and CI) never need the generator at build time. A test checks the committed output is current.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile, type JSONSchema } from 'json-schema-to-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const contracts = join(here, '..', '..', '..', 'contracts');
const outDir = join(here, '..', 'src', 'generated');

const HEADER =
  '// GENERATED FILE. Do not edit by hand: run `pnpm --filter @hesabu/report-model gen`.\n' +
  '// Source: contracts/%s (frozen contract, orchestrator-owned).\n\n';

/**
 * json-schema-to-typescript emits `Pct1`, `Pct2`, ... for a `$ref` that carries its own `description`. The bodies
 * are identical to the base interface, so fold them back into one name.
 */
export function dedupeNumberedInterfaces(source: string): string {
  const blocks = [...source.matchAll(/(?:\/\*\*[\s\S]*?\*\/\n)?export interface (\w+?)(\d*) \{\n([\s\S]*?)\n\}\n/g)];
  const bodies = new Map<string, string>();
  for (const m of blocks) if (m[2] === '') bodies.set(m[1]!, m[3]!);
  let out = source;
  for (const m of blocks) {
    const [whole, base, suffix, body] = m as unknown as [string, string, string, string];
    if (suffix === '' || bodies.get(base) !== body) continue;
    out = out.replace(whole, '');
    out = out.replace(new RegExp(`\\b${base}${suffix}\\b`, 'g'), base);
  }
  return out.replace(/\n{3,}/g, '\n\n');
}

async function generate(schemaFile: string, outFile: string): Promise<string> {
  const schema = JSON.parse(readFileSync(join(contracts, schemaFile), 'utf8')) as JSONSchema;
  const body = await compile(schema, schema.title ?? outFile, {
    bannerComment: '',
    additionalProperties: false,
    strictIndexSignatures: true,
    style: { singleQuote: true, printWidth: 110 },
    // keep the generator offline and deterministic
    cwd: contracts,
    declareExternallyReferenced: true,
    unreachableDefinitions: true,
    ignoreMinAndMaxItems: true,
  });
  // `drilldown: { type: ["object","null"] }` has no properties in the contract; `{}` is the generator's spelling of
  // "any object", which lint rejects, so say `object` explicitly.
  const text = HEADER.replace('%s', schemaFile) + dedupeNumberedInterfaces(body).replace(/\?: \{\} \| null;/g, '?: object | null;');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, outFile), text);
  return text;
}

export async function generateAll(): Promise<Record<string, string>> {
  // The schemas themselves are copied next to the types so the package is self-contained after build.
  mkdirSync(outDir, { recursive: true });
  for (const f of ['facts-sheet.schema.json', 'report-document.schema.json']) {
    writeFileSync(join(outDir, f), readFileSync(join(contracts, f), 'utf8'));
  }
  return {
    'facts-sheet.ts': await generate('facts-sheet.schema.json', 'facts-sheet.ts'),
    'report-document.ts': await generate('report-document.schema.json', 'report-document.ts'),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await generateAll();
  console.log('generated', outDir);
}
