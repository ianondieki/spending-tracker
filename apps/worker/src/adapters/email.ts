export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
  /** When set, the attachment is inline and referenced from the HTML as `cid:<contentId>`. */
  contentId?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
}

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Records messages; never sends. */
export class FakeEmailSender implements EmailSender {
  readonly name = 'fake';
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    return { providerMessageId: `fake-email-${this.sent.length}` };
  }
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Resend REST API: HTML + text parts, inline images by content id, the PDF attached. */
export class ResendEmailSender implements EmailSender {
  readonly name = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {
    if (!apiKey) throw new Error('RESEND_API_KEY is required (fail closed)');
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const body = {
      from: this.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString('base64'),
        content_type: a.contentType,
        ...(a.contentId ? { content_id: a.contentId } : {}),
      })),
    };
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`resend ${res.status}: ${text.slice(0, 200)}`);
    const parsed = JSON.parse(text) as { id?: string };
    if (!parsed.id) throw new Error('resend: no message id in response');
    return { providerMessageId: parsed.id };
  }
}
