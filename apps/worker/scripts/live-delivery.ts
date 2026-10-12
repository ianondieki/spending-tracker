/**
 * Sends the latest generated WEEKLY report to the owner, once, over the real providers. Refuses to run unless every
 * secret and recipient is present, and only ever addresses REPORT_TO_EMAIL and REPORT_TO_WHATSAPP (never a user's
 * stored preferences). Nothing here runs in CI or tests.
 *
 *   DATABASE_URL=... RESEND_API_KEY=... WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \
 *   REPORT_TO_EMAIL=you@example.com REPORT_TO_WHATSAPP=+2547XXXXXXXX pnpm --filter @hesabu/worker live-delivery
 *
 * Options: CHANNELS=email,whatsapp (default both); DRY_RUN=1 prints what would be sent and exits.
 */
import { ReportDocumentSchema } from '@hesabu/agents';
import { Db } from '@hesabu/db';

import { ResendEmailSender } from '../src/adapters/email.ts';
import { FsStorage, S3Storage } from '../src/adapters/storage.ts';
import { CloudApiWhatsAppSender } from '../src/adapters/whatsapp.ts';
import { readWorkerConfig } from '../src/config.ts';

const REQUIRED = ['DATABASE_URL', 'RESEND_API_KEY', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'REPORT_TO_EMAIL', 'REPORT_TO_WHATSAPP'] as const;
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`live-delivery refused: missing ${missing.join(', ')} (every secret and recipient is required; nothing was sent)`);
  process.exit(2);
}
const toEmail = process.env['REPORT_TO_EMAIL']!;
const toWhatsapp = process.env['REPORT_TO_WHATSAPP']!;
if (!/^\+[1-9]\d{6,14}$/.test(toWhatsapp)) {
  console.error('live-delivery refused: REPORT_TO_WHATSAPP must be E.164 (+2547XXXXXXXX)');
  process.exit(2);
}
const channels = (process.env['CHANNELS'] ?? 'email,whatsapp').split(',').map((c) => c.trim()).filter((c) => c === 'email' || c === 'whatsapp');
const dryRun = process.env['DRY_RUN'] === '1';

const config = readWorkerConfig(process.env);
const db = await Db.open(process.env, { migrate: false });
try {
  // The latest finished weekly report across users, by generated_at.
  const rows = await db.rawSql<{ id: string; user_id: string }[]>`
    SELECT id, user_id FROM reports WHERE kind = 'weekly' AND status = 'done' ORDER BY generated_at DESC NULLS LAST LIMIT 1`;
  const row = rows[0];
  if (!row) throw new Error('no finished weekly report; generate one first (make seed-demo)');
  const tenant = db.forUser(row.user_id);
  const report = await tenant.getReport(row.id);
  if (!report) throw new Error('report vanished');
  const document = ReportDocumentSchema.parse(report.document_json);
  const storage = config.s3 ? new S3Storage(config.s3) : new FsStorage(config.storageDir, config.appBaseUrl);
  const a = report.artefacts;
  const hero = await storage.get(a.hero_png_key!);
  const pdf = await storage.get(a.pdf_key!);
  console.log(`report ${report.id} (${report.period_start.slice(0, 10)}, ${report.writer}) → ${channels.join(' + ')} for the owner${dryRun ? ' [dry run]' : ''}`);
  if (dryRun) process.exit(0);

  if (channels.includes('email')) {
    const sender = new ResendEmailSender(config.resend!.apiKey, config.resend!.from);
    const html = new TextDecoder().decode(await storage.get(a.html_key!.replace(/web\.html$/, 'email.html')));
    const text = new TextDecoder().decode(await storage.get(a.html_key!.replace(/web\.html$/, 'email.txt')));
    const attachments = [
      { filename: 'hero.png', content: hero, contentType: 'image/png', contentId: 'hero' },
      { filename: `hesabu-weekly-${report.period_start.slice(0, 10)}.pdf`, content: pdf, contentType: 'application/pdf' },
    ];
    for (const [chartId, key] of Object.entries(a.chart_keys ?? {})) {
      attachments.push({ filename: `${chartId}.png`, content: await storage.get(key), contentType: 'image/png', contentId: chartId });
    }
    const sent = await sender.send({ to: toEmail, subject: document.email.subject, html, text, attachments });
    await tenant.audit('script:live-delivery', 'delivery.sent', { channel: 'email', provider_message_id: sent.providerMessageId });
    console.log(`email sent: ${sent.providerMessageId}`);
  }
  if (channels.includes('whatsapp')) {
    const wa = new CloudApiWhatsAppSender(config.whatsapp!.token, config.whatsapp!.phoneNumberId, config.whatsapp!.apiVersion);
    const image = await wa.uploadMedia(hero, 'image/png', 'hesabu-hero.png');
    const msg = await wa.sendImage(toWhatsapp, image.mediaId, document.whatsapp.caption);
    const doc = await wa.uploadMedia(pdf, 'application/pdf', 'hesabu-weekly.pdf');
    await wa.sendDocument(toWhatsapp, doc.mediaId, `hesabu-weekly-${report.period_start.slice(0, 10)}.pdf`);
    await tenant.audit('script:live-delivery', 'delivery.sent', { channel: 'whatsapp', provider_message_id: msg.messageId });
    console.log(`whatsapp sent: ${msg.messageId}`);
  }
} finally {
  await db.close();
}
