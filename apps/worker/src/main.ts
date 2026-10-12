import { buildWorker } from './boot.js';

const worker = await buildWorker(process.env);
await worker.start();

const shutdown = async (): Promise<void> => {
  console.log('worker: stopping');
  await worker.stop();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
