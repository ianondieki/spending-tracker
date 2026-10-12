import { describe, expect, it } from 'vitest';

import { run, WORKER_TIME_ZONE } from './index.js';

describe('worker run (placeholder)', () => {
  it('logs, runs zero jobs and resolves', async () => {
    const lines: string[] = [];
    const result = await run((line) => lines.push(line));
    expect(result.jobsRun).toBe(0);
    expect(result.timeZone).toBe('Africa/Nairobi');
    expect(WORKER_TIME_ZONE).toBe('Africa/Nairobi');
    expect(lines.some((l) => l.includes('starting'))).toBe(true);
    expect(lines.some((l) => l.includes('exiting'))).toBe(true);
  });
});
