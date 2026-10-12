/** Job names and payloads shared by the API (producer) and the worker (consumer) over pg-boss. */
export const REPORT_GENERATE_JOB = 'report.generate';
export const REPORT_DELIVER_JOB = 'report.deliver';
export const SCHEDULER_TICK_JOB = 'scheduler.tick';
export const EMAIL_LINK_JOB = 'email.send_link';

/** The worker (which owns the email adapter) sends the magic link; the API only mints the token. */
export interface EmailLinkJob {
  user_id: string;
  email: string;
  link: string;
  locale: 'en' | 'sw';
}

export interface ReportGenerateJob {
  user_id: string;
  report_id: string;
  deliver: boolean;
}

export interface ReportDeliverJob {
  user_id: string;
  report_id: string;
  channels: ('email' | 'whatsapp')[];
}

/** Singleton keys make enqueues idempotent while a job for the same report is queued or running. */
export const reportJobKey = (reportId: string): string => `report:${reportId}`;
export const deliveryJobKey = (reportId: string, channel: string): string => `deliver:${reportId}:${channel}`;
