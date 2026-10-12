/** Wires real adapters (or fakes when a secret is missing), pg-boss queues and the scheduler. */
import { AnthropicModelClient, BudgetGuard, DbCostLedger, FakeModelClient, readAiConfig } from '@hesabu/agents';
import { Db, getDatabaseUrl, REPORT_DELIVER_JOB, REPORT_GENERATE_JOB, SCHEDULER_TICK_JOB, deliveryJobKey, reportJobKey, type ReportDeliverJob, type ReportGenerateJob } from '@hesabu/db';
import { PgBoss } from 'pg-boss';

import { FakeEmailSender, ResendEmailSender, type EmailSender } from './adapters/email.js';
import { PackageRenderer, type Renderer } from './adapters/renderer.js';
import { FsStorage, S3Storage, type Storage } from './adapters/storage.js';
import { CloudApiWhatsAppSender, FakeWhatsAppSender, type WhatsAppSender } from './adapters/whatsapp.js';
import { readWorkerConfig, type Env } from './config.js';
import { runDeliveryJob, type DeliveryDeps } from './deliver.js';
import { schedulerTick } from './scheduler.js';
import { runReportJob, type WorkflowDeps } from './workflow.js';

export interface WorkerHandle {
  readonly db: Db;
  readonly boss: PgBoss;
  readonly workflow: WorkflowDeps;
  readonly delivery: DeliveryDeps;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function buildWorker(env: Env = process.env, log: (line: string) => void = console.log): Promise<WorkerHandle> {
  const config = readWorkerConfig(env);
  const db = await Db.open(env);
  const boss = new PgBoss({ connectionString: getDatabaseUrl(env), schema: 'pgboss' });
  boss.on('error', (err: Error) => console.error('pg-boss', err.message));

  const storage: Storage = config.s3 ? new S3Storage(config.s3) : new FsStorage(config.storageDir, config.appBaseUrl);
  const email: EmailSender | null = config.resend ? new ResendEmailSender(config.resend.apiKey, config.resend.from) : config.isProduction ? null : new FakeEmailSender();
  const whatsapp: WhatsAppSender | null = config.whatsapp
    ? new CloudApiWhatsAppSender(config.whatsapp.token, config.whatsapp.phoneNumberId, config.whatsapp.apiVersion)
    : config.isProduction
      ? null
      : new FakeWhatsAppSender();
  const renderer: Renderer = new PackageRenderer();

  const ai = readAiConfig(env);
  const ledger = new DbCostLedger(db);
  const guard = new BudgetGuard(ai, ledger);
  const client = ai.enabled ? new AnthropicModelClient({ apiKey: ai.apiKey, model: ai.model, guard, ledger }) : new FakeModelClient([]);
  log(`worker: ai=${ai.enabled ? ai.model : 'off (numbers-only fallback)'} storage=${config.s3 ? 's3' : 'fs'} email=${email?.name ?? 'none'} whatsapp=${whatsapp?.name ?? 'none'}`);

  const enqueueDeliver = async (job: ReportDeliverJob): Promise<void> => {
    for (const channel of job.channels) {
      await boss.send(REPORT_DELIVER_JOB, { ...job, channels: [channel] }, { singletonKey: deliveryJobKey(job.report_id, channel), retryLimit: 3, retryDelay: 60, retryBackoff: true });
    }
  };
  const workflow: WorkflowDeps = {
    db, renderer, storage, client, guard, ledger,
    appBaseUrl: config.appBaseUrl, reportLinkSecret: config.reportLinkSecret, reportLinkTtlDays: config.reportLinkTtlDays,
    enqueueDeliver, log,
  };
  const delivery: DeliveryDeps = { db, storage, email, whatsapp, log };

  return {
    db, boss, workflow, delivery,
    async start() {
      await boss.start();
      await boss.createQueue(REPORT_GENERATE_JOB);
      await boss.createQueue(REPORT_DELIVER_JOB);
      await boss.createQueue(SCHEDULER_TICK_JOB);
      await boss.work<ReportGenerateJob>(REPORT_GENERATE_JOB, async ([job]) => {
        if (job) await runReportJob(workflow, job.data);
      });
      await boss.work<ReportDeliverJob>(REPORT_DELIVER_JOB, async ([job]) => {
        if (job) await runDeliveryJob(delivery, job.data);
      });
      await boss.work(SCHEDULER_TICK_JOB, async () => {
        await schedulerTick({
          db,
          enqueue: (job: ReportGenerateJob) => boss.send(REPORT_GENERATE_JOB, job, { singletonKey: reportJobKey(job.report_id), retryLimit: 2, retryDelay: 30 }).then(() => {}),
          log,
        });
      });
      await boss.schedule(SCHEDULER_TICK_JOB, '*/5 * * * *', null, { tz: 'Africa/Nairobi' });
      log('worker: started (scheduler every 5 minutes)');
    },
    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 });
      await db.close();
    },
  };
}
