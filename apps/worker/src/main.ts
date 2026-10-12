import { run } from './index.js';

run()
  .then((result) => {
    console.log(`hesabu worker: done (${result.jobsRun} jobs)`);
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('hesabu worker: failed', error);
    process.exit(1);
  });
