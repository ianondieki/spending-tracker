/** `pnpm --filter @hesabu/pack-engine demo:write` — regenerates corpus/demo/demo-inbox.jsonl and its expectations. */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CORPUS_DIR, readJsonl, runCorpus } from '../corpus.js';
import { loadAllPacks } from '../loader.js';
import { DEMO_VARIABLES, generateDemoInbox, toJsonl } from './generate.js';
import { expectationsFor } from './expectations.js';

const dir = path.join(CORPUS_DIR, 'demo');
mkdirSync(dir, { recursive: true });
const { lines } = generateDemoInbox();
const inboxPath = path.join(dir, 'demo-inbox.jsonl');
writeFileSync(inboxPath, toJsonl(lines));
const result = runCorpus(loadAllPacks(), readJsonl(inboxPath), { variables: DEMO_VARIABLES });
const expectations = expectationsFor(result);
writeFileSync(path.join(dir, 'demo-inbox.expected.json'), `${JSON.stringify(expectations, null, 2)}\n`);
console.log(`${lines.length} lines; parsed ${result.parsed}, ignored ${result.ignored}, unknown ${result.unknown.length}, duplicates ${result.post.duplicates}, pairs ${result.post.transfer_pairs.length}, chain breaks ${result.post.balance.breaks.length}`);
for (const u of result.unknown) console.log(`UNKNOWN: ${u.line.body}`);
for (const b of result.post.balance.breaks) console.log(`BREAK: ${JSON.stringify(b)}`);
if (result.unknown.length || result.post.balance.breaks.length) process.exitCode = 1;
