// Writes fixtures/<name>.json from the TypeScript fixtures. Run with `pnpm fixtures` (uses vitest's loader via
// `vite-node`-free approach: it is executed by the fixtures test in `--update` mode) or `pnpm fixtures:write`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtures } from '../src/fixtures/index.js';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
mkdirSync(outDir, { recursive: true });
for (const f of Object.values(fixtures)) {
  writeFileSync(join(outDir, `${f.name}.json`), JSON.stringify({ facts: f.facts, document: f.document }, null, 2) + '\n');
}
console.log('wrote', Object.keys(fixtures).length, 'fixtures to', outDir);
