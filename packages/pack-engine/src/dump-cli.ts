/** `pnpm --filter @hesabu/pack-engine dump` — rewrites corpus/expected/ from this engine's output. */
import { dumpAll, writeDumps } from './dump.js';
import { loadAllPacks } from './loader.js';

for (const file of writeDumps(dumpAll(loadAllPacks()))) console.log(file);
