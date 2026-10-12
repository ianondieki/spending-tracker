import {
  deliveryJobKey, EMAIL_LINK_JOB, REPORT_DELIVER_JOB, REPORT_GENERATE_JOB, reportJobKey,
  type EmailLinkJob, type ReportDeliverJob, type ReportGenerateJob,
} from '@hesabu/db';
import { PgBoss } from 'pg-boss';

/** The API only enqueues; the worker consumes. */
export interface JobQueue {
  enqueueGenerate(job: ReportGenerateJob): Promise<void>;
  enqueueDeliver(job: ReportDeliverJob): Promise<void>;
  enqueueEmailLink(job: EmailLinkJob): Promise<void>;
}

/** Records jobs for tests and for in-process runs. */
export class InMemoryQueue implements JobQueue {
  readonly generated: ReportGenerateJob[] = [];
  readonly deliveries: ReportDeliverJob[] = [];
  readonly emailLinks: EmailLinkJob[] = [];
  async enqueueGenerate(job: ReportGenerateJob): Promise<void> {
    this.generated.push(job);
  }
  async enqueueDeliver(job: ReportDeliverJob): Promise<void> {
    this.deliveries.push(job);
  }
  async enqueueEmailLink(job: EmailLinkJob): Promise<void> {
    this.emailLinks.push(job);
  }
}

export class PgBossQueue implements JobQueue {
  private constructor(private readonly boss: PgBoss) {}

  static async start(databaseUrl: string): Promise<PgBossQueue> {
    const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
    boss.on('error', (err: Error) => console.error('pg-boss', err));
    await boss.start();
    await boss.createQueue(REPORT_GENERATE_JOB);
    await boss.createQueue(REPORT_DELIVER_JOB);
    await boss.createQueue(EMAIL_LINK_JOB);
    return new PgBossQueue(boss);
  }

  async enqueueGenerate(job: ReportGenerateJob): Promise<void> {
    await this.boss.send(REPORT_GENERATE_JOB, job, { singletonKey: reportJobKey(job.report_id), retryLimit: 2, retryDelay: 30 });
  }

  async enqueueDeliver(job: ReportDeliverJob): Promise<void> {
    for (const channel of job.channels) {
      await this.boss.send(REPORT_DELIVER_JOB, { ...job, channels: [channel] }, {
        singletonKey: deliveryJobKey(job.report_id, channel),
        retryLimit: 3,
        retryDelay: 60,
        retryBackoff: true,
      });
    }
  }

  async enqueueEmailLink(job: EmailLinkJob): Promise<void> {
    await this.boss.send(EMAIL_LINK_JOB, job, { retryLimit: 2, retryDelay: 30 });
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 5000 });
  }
}
