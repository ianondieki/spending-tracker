/**
 * Delivery per (report, channel): idempotent (a delivery already sent, delivered or read is not sent
 * again), consent- and address-gated, and recorded with the provider message id so webhooks can update
 * the status later. Missing provider configuration marks the delivery `skipped`, never a half send.
 */
import { ReportDocumentSchema } from '@hesabu/agents';
import type { Db, ReportDeliverJob, ReportRow, TenantDb } from '@hesabu/db';

import type { EmailSender } from './adapters/email.js';
import type { Storage } from './adapters/storage.js';
import type { WhatsAppSender } from './adapters/whatsapp.js';

export interface DeliveryDeps {
  db: Db;
  storage: Storage;
  email: EmailSender | null;
  whatsapp: WhatsAppSender | null;
  log?: (line: string) => void;
}

export interface DeliveryOutcome {
  channel: 'email' | 'whatsapp';
  status: 'sent' | 'skipped' | 'failed' | 'already';
  reason?: string;
  providerMessageId?: string;
}

function requireKey(report: ReportRow, key: string | null | undefined, what: string): string {
  if (!key) throw new Error(`report ${report.id} has no ${what} artefact`);
  return key;
}

export async function runDeliveryJob(deps: DeliveryDeps, job: ReportDeliverJob): Promise<DeliveryOutcome[]> {
  const log = deps.log ?? (() => {});
  const tenant = deps.db.forUser(job.user_id);
  const report = await tenant.getReport(job.report_id);
  if (!report) return job.channels.map((channel) => ({ channel, status: 'failed', reason: 'report not found' }));
  const outcomes: DeliveryOutcome[] = [];
  for (const channel of job.channels) {
    outcomes.push(await deliverOne(deps, tenant, report, channel, log));
  }
  return outcomes;
}

async function deliverOne(deps: DeliveryDeps, tenant: TenantDb, report: ReportRow, channel: 'email' | 'whatsapp', log: (l: string) => void): Promise<DeliveryOutcome> {
  const delivery = await tenant.ensureDelivery(report.id, channel);
  if (delivery.status === 'sent' || delivery.status === 'delivered' || delivery.status === 'read') {
    return { channel, status: 'already', providerMessageId: delivery.provider_message_id ?? undefined };
  }
  if (report.status !== 'done') {
    await tenant.updateDelivery(delivery.id, { status: 'failed', last_error: `report is ${report.status}`, bump_attempts: true });
    return { channel, status: 'failed', reason: `report is ${report.status}` };
  }
  const skip = async (reason: string): Promise<DeliveryOutcome> => {
    await tenant.updateDelivery(delivery.id, { status: 'skipped', last_error: reason });
    await tenant.audit('worker', 'delivery.skipped', { channel, reason });
    return { channel, status: 'skipped', reason };
  };
  const prefs = await tenant.getPreferences();
  const document = ReportDocumentSchema.parse(report.document_json);
  try {
    if (channel === 'email') {
      if (!prefs.email) return skip('no email address');
      if (!(await tenant.hasConsent('email_delivery'))) return skip('email_delivery consent not granted');
      if (!deps.email) return skip('email provider not configured');
      const html = new TextDecoder().decode(await deps.storage.get(requireKey(report, report.artefacts.html_key?.replace(/web\.html$/, 'email.html'), 'email html')));
      const text = new TextDecoder().decode(await deps.storage.get(requireKey(report, report.artefacts.html_key?.replace(/web\.html$/, 'email.txt'), 'email text')));
      const hero = await deps.storage.get(requireKey(report, report.artefacts.hero_png_key, 'hero'));
      const pdf = await deps.storage.get(requireKey(report, report.artefacts.pdf_key, 'pdf'));
      const attachments = [
        { filename: 'hero.png', content: hero, contentType: 'image/png', contentId: 'hero' },
        { filename: `hesabu-${document.kind}-${report.period_start.slice(0, 10)}.pdf`, content: pdf, contentType: 'application/pdf' },
      ];
      for (const [chartId, key] of Object.entries(report.artefacts.chart_keys ?? {})) {
        attachments.push({ filename: `${chartId}.png`, content: await deps.storage.get(key), contentType: 'image/png', contentId: chartId });
      }
      await tenant.updateDelivery(delivery.id, { bump_attempts: true });
      const sent = await deps.email.send({ to: prefs.email, subject: document.email.subject, html, text, attachments });
      await tenant.updateDelivery(delivery.id, { status: 'sent', provider_message_id: sent.providerMessageId, last_error: null });
      await tenant.audit('worker', 'delivery.sent', { channel, provider: deps.email.name });
      log(`deliver: email sent for ${report.id} via ${deps.email.name}`);
      return { channel, status: 'sent', providerMessageId: sent.providerMessageId };
    }
    if (!prefs.whatsapp_e164) return skip('no WhatsApp number');
    if (!(await tenant.hasConsent('whatsapp_delivery'))) return skip('whatsapp_delivery consent not granted (JOIN not received)');
    if (!deps.whatsapp) return skip('WhatsApp provider not configured');
    const hero = await deps.storage.get(requireKey(report, report.artefacts.hero_png_key, 'hero'));
    const pdf = await deps.storage.get(requireKey(report, report.artefacts.pdf_key, 'pdf'));
    await tenant.updateDelivery(delivery.id, { bump_attempts: true });
    const image = await deps.whatsapp.uploadMedia(hero, 'image/png', 'hesabu-hero.png');
    const message = await deps.whatsapp.sendImage(prefs.whatsapp_e164, image.mediaId, document.whatsapp.caption);
    await tenant.updateDelivery(delivery.id, { status: 'sent', provider_message_id: message.messageId, last_error: null });
    const doc = await deps.whatsapp.uploadMedia(pdf, 'application/pdf', `hesabu-${document.kind}.pdf`);
    await deps.whatsapp.sendDocument(prefs.whatsapp_e164, doc.mediaId, `hesabu-${document.kind}-${report.period_start.slice(0, 10)}.pdf`);
    await tenant.audit('worker', 'delivery.sent', { channel, provider: deps.whatsapp.name });
    log(`deliver: whatsapp sent for ${report.id} via ${deps.whatsapp.name}`);
    return { channel, status: 'sent', providerMessageId: message.messageId };
  } catch (err) {
    const reason = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    await tenant.updateDelivery(delivery.id, { status: 'failed', last_error: reason });
    await tenant.audit('worker', 'delivery.failed', { channel, reason: reason.slice(0, 120) });
    throw err; // pg-boss retries with backoff
  }
}
