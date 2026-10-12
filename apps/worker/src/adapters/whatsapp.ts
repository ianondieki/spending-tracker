export interface WhatsAppSender {
  readonly name: string;
  uploadMedia(bytes: Uint8Array, mimeType: string, filename: string): Promise<{ mediaId: string }>;
  sendImage(to: string, mediaId: string, caption: string): Promise<{ messageId: string }>;
  sendDocument(to: string, mediaId: string, filename: string, caption?: string): Promise<{ messageId: string }>;
  /** Utility template path (weekly_report_v1 / monthly_report_v1); stubbed until Meta approves the templates. */
  sendTemplate(to: string, template: string, params: { headerMediaId: string; body: string[]; url: string }): Promise<{ messageId: string }>;
}

export interface FakeWaCall {
  kind: 'upload' | 'image' | 'document' | 'template';
  to?: string;
  caption?: string;
  filename?: string;
  mimeType?: string;
  bytes?: number;
}

export class FakeWhatsAppSender implements WhatsAppSender {
  readonly name = 'fake';
  readonly calls: FakeWaCall[] = [];
  async uploadMedia(bytes: Uint8Array, mimeType: string, filename: string): Promise<{ mediaId: string }> {
    this.calls.push({ kind: 'upload', mimeType, filename, bytes: bytes.byteLength });
    return { mediaId: `fake-media-${this.calls.length}` };
  }
  async sendImage(to: string, _mediaId: string, caption: string): Promise<{ messageId: string }> {
    this.calls.push({ kind: 'image', to, caption });
    return { messageId: `wamid.fake-${this.calls.length}` };
  }
  async sendDocument(to: string, _mediaId: string, filename: string, caption?: string): Promise<{ messageId: string }> {
    this.calls.push({ kind: 'document', to, filename, caption });
    return { messageId: `wamid.fake-${this.calls.length}` };
  }
  async sendTemplate(to: string, template: string): Promise<{ messageId: string }> {
    this.calls.push({ kind: 'template', to, caption: template });
    return { messageId: `wamid.fake-${this.calls.length}` };
  }
}

export type WaFetch = (input: string, init: { method: string; headers: Record<string, string>; body: string | FormData }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** WhatsApp Cloud API (Meta Graph): upload media, send image with caption, send document. */
export class CloudApiWhatsAppSender implements WhatsAppSender {
  readonly name = 'cloud-api';
  private readonly base: string;

  constructor(
    private readonly token: string,
    phoneNumberId: string,
    apiVersion = 'v21.0',
    private readonly fetchImpl: WaFetch = (input, init) => fetch(input, init),
  ) {
    if (!token || !phoneNumberId) throw new Error('WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required (fail closed)');
    this.base = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`;
  }

  private async call<T>(path: string, body: string | FormData, contentType?: string): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.token}` };
    if (contentType) headers['content-type'] = contentType;
    const res = await this.fetchImpl(`${this.base}/${path}`, { method: 'POST', headers, body });
    const text = await res.text();
    if (!res.ok) throw new Error(`whatsapp ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }

  async uploadMedia(bytes: Uint8Array, mimeType: string, filename: string): Promise<{ mediaId: string }> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([bytes], { type: mimeType }), filename);
    const out = await this.call<{ id: string }>('media', form);
    return { mediaId: out.id };
  }

  private async sendMessage(payload: Record<string, unknown>): Promise<{ messageId: string }> {
    const out = await this.call<{ messages?: { id: string }[] }>('messages', JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }), 'application/json');
    const id = out.messages?.[0]?.id;
    if (!id) throw new Error('whatsapp: no message id in response');
    return { messageId: id };
  }

  sendImage(to: string, mediaId: string, caption: string): Promise<{ messageId: string }> {
    return this.sendMessage({ to: to.replace(/^\+/, ''), type: 'image', image: { id: mediaId, caption: caption.slice(0, 1024) } });
  }

  sendDocument(to: string, mediaId: string, filename: string, caption?: string): Promise<{ messageId: string }> {
    return this.sendMessage({ to: to.replace(/^\+/, ''), type: 'document', document: { id: mediaId, filename, ...(caption ? { caption: caption.slice(0, 1024) } : {}) } });
  }

  sendTemplate(to: string, template: string, params: { headerMediaId: string; body: string[]; url: string }): Promise<{ messageId: string }> {
    return this.sendMessage({
      to: to.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: template,
        language: { code: 'en' },
        components: [
          { type: 'header', parameters: [{ type: 'image', image: { id: params.headerMediaId } }] },
          { type: 'body', parameters: params.body.map((text) => ({ type: 'text', text })) },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: params.url }] },
        ],
      },
    });
  }
}
