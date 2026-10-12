import { serve } from '@hono/node-server';
import { Db, getDatabaseUrl } from '@hesabu/db';

import { createApp } from './app.js';
import { createExtractor } from './extractor.js';
import { PgBossQueue } from './queue.js';

export { createApp } from './app.js';
export type { AppDeps } from './app.js';

const port = Number(process.env['PORT'] ?? 8787);
const db = await Db.open(process.env);
const queue = await PgBossQueue.start(getDatabaseUrl(process.env));
const app = createApp({ db, queue, env: process.env, extractor: createExtractor(process.env) });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`hesabu api listening on http://localhost:${info.port}`);
});

const shutdown = async (): Promise<void> => {
  await queue.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
