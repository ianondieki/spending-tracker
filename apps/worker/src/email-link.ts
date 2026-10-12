/** Sends the email-confirmation magic link (the only path that grants email_delivery consent). */
import type { EmailLinkJob } from '@hesabu/db';

import type { EmailSender } from './adapters/email.js';

const COPY = {
  en: { subject: 'Confirm your email for Hesabu reports', body: (link: string) => `Tap to confirm this address for your Hesabu reports. The link works once and expires in an hour.\n\n${link}\n\nIf you did not ask for this, ignore it.` },
  sw: { subject: 'Thibitisha barua pepe yako kwa ripoti za Hesabu', body: (link: string) => `Gusa kuthibitisha anwani hii kwa ripoti zako za Hesabu. Kiungo kinafanya kazi mara moja na kinaisha baada ya saa moja.\n\n${link}\n\nKama hukuomba hii, puuza.` },
} as const;

export async function sendEmailLink(deps: { email: EmailSender | null; log?: (line: string) => void }, job: EmailLinkJob): Promise<{ sent: boolean; reason?: string }> {
  if (!deps.email) {
    deps.log?.(`email-link: no email provider configured; link for ${job.user_id} not sent`);
    return { sent: false, reason: 'email provider not configured' };
  }
  const copy = COPY[job.locale] ?? COPY.en;
  const text = copy.body(job.link);
  const html = `<p>${text.replace(/\n/g, '<br>').replace(job.link, `<a href="${job.link}">${job.link}</a>`)}</p>`;
  await deps.email.send({ to: job.email, subject: copy.subject, html, text, attachments: [] });
  deps.log?.(`email-link: sent to user ${job.user_id} via ${deps.email.name}`);
  return { sent: true };
}
