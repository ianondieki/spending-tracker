import { ANALYTICS_VERSION } from '@hesabu/analytics';

export const WORKER_TIME_ZONE = 'Africa/Nairobi';

export interface WorkerRunResult {
  readonly startedAt: string;
  readonly timeZone: string;
  readonly analyticsVersion: string;
  readonly jobsRun: number;
}

export type Logger = (message: string) => void;

/**
 * Placeholder run: logs and returns. Lane B replaces this with the scheduler and the report
 * workflow (collect → insight-select → write → check → render → deliver).
 */
export async function run(log: Logger = console.log): Promise<WorkerRunResult> {
  const startedAt = new Date().toISOString();
  log(
    `hesabu worker: starting at ${startedAt} (tz=${WORKER_TIME_ZONE}, analytics ${ANALYTICS_VERSION})`,
  );
  log('hesabu worker: no jobs scheduled yet; exiting');
  return { startedAt, timeZone: WORKER_TIME_ZONE, analyticsVersion: ANALYTICS_VERSION, jobsRun: 0 };
}
