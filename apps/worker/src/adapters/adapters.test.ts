import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readWorkerConfig } from '../config.js';
import { FakeEmailSender, ResendEmailSender } from './email.js';
import { minimalPdf, ONE_PIXEL_PNG, StubRenderer } from './renderer.js';
import { FsStorage, MemoryStorage } from './storage.js';
import { CloudApiWhatsAppSender, FakeWhatsAppSender } from './whatsapp.js';

describe('worker config', () => {
  it('uses fakes when secrets are missing and refuses half-configured S3', () => {
    const c = readWorkerConfig({});
    expect(c.resend).toBeNull();
    expect(c.whatsapp).toBeNull();
    expect(c.s3).toBeNull();
    expect(() => readWorkerConfig({ S3_ENDPOINT: 'http://x' })).toThrow(/fail closed/);
    const full = readWorkerConfig({ RESEND_API_KEY: 'k', WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: 'p', S3_ENDPOINT: 'http://x', S3_BUCKET: 'b', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 's' });
    expect(full.resend?.apiKey).toBe('k');
    expect(full.whatsapp?.phoneNumberId).toBe('p');
    expect(full.s3?.bucket).toBe('b');
  });
});

describe('storage', () => {
  it('round-trips through the filesystem fake and refuses path escapes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hesabu-storage-'));
    const s = new FsStorage(dir);
    const { key } = await s.put('reports/u/r/hero.png', ONE_PIXEL_PNG, 'image/png');
    expect(key).toBe('reports/u/r/hero.png');
    expect(await s.signedGetUrl('reports/u/r/hero.png', 60)).toBeNull(); // the API serves these through its signed route
    expect(Buffer.from(await s.get('reports/u/r/hero.png')).equals(ONE_PIXEL_PNG)).toBe(true);
    await s.put('../../escape.txt', 'x', 'text/plain');
    await expect(s.get('escape.txt')).resolves.toBeDefined();
  });

  it('memory fake records content types', async () => {
    const m = new MemoryStorage();
    await m.put('a.html', '<p>hi</p>', 'text/html');
    expect(m.objects.get('a.html')?.contentType).toBe('text/html');
    expect(new TextDecoder().decode(await m.get('a.html'))).toBe('<p>hi</p>');
    await expect(m.get('nope')).rejects.toThrow(/no object/);
  });
});

describe('email adapters', () => {
  it('fake records and numbers messages', async () => {
    const f = new FakeEmailSender();
    const r = await f.send({ to: 'a@b.test', subject: 's', html: '<p>h</p>', text: 't', attachments: [] });
    expect(r.providerMessageId).toBe('fake-email-1');
    expect(f.sent).toHaveLength(1);
  });

  it('resend sends inline images by content id and the PDF as an attachment', async () => {
    const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = [];
    const sender = new ResendEmailSender('re_key', 'Hesabu <x@y.test>', async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'email-123' }) };
    });
    const r = await sender.send({
      to: 'a@b.test', subject: 'Your week', html: '<img src="cid:hero">', text: 'plain',
      attachments: [
        { filename: 'hero.png', content: ONE_PIXEL_PNG, contentType: 'image/png', contentId: 'hero' },
        { filename: 'report.pdf', content: minimalPdf('t'), contentType: 'application/pdf' },
      ],
    });
    expect(r.providerMessageId).toBe('email-123');
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.init.headers['authorization']).toBe('Bearer re_key');
    const body = JSON.parse(calls[0]!.init.body) as { attachments: { filename: string; content_id?: string }[]; to: string[] };
    expect(body.to).toEqual(['a@b.test']);
    expect(body.attachments[0]?.content_id).toBe('hero');
    expect(body.attachments[1]?.content_id).toBeUndefined();
    expect(() => new ResendEmailSender('', 'x')).toThrow(/fail closed/);
    const failing = new ResendEmailSender('k', 'x', async () => ({ ok: false, status: 422, text: async () => 'bad' }));
    await expect(failing.send({ to: 'a', subject: 's', html: '', text: '', attachments: [] })).rejects.toThrow(/resend 422/);
  });
});

describe('whatsapp adapters', () => {
  it('fake records uploads and sends', async () => {
    const f = new FakeWhatsAppSender();
    const { mediaId } = await f.uploadMedia(ONE_PIXEL_PNG, 'image/png', 'hero.png');
    const { messageId } = await f.sendImage('+254700000000', mediaId, 'caption');
    expect(messageId).toMatch(/^wamid\.fake/);
    expect(f.calls.map((c) => c.kind)).toEqual(['upload', 'image']);
  });

  it('cloud api shapes media upload and message requests', async () => {
    const calls: { url: string; body: string | FormData }[] = [];
    const sender = new CloudApiWhatsAppSender('tok', '12345', 'v21.0', async (url, init) => {
      calls.push({ url, body: init.body });
      const isMedia = url.endsWith('/media');
      return { ok: true, status: 200, text: async () => (isMedia ? JSON.stringify({ id: 'media-1' }) : JSON.stringify({ messages: [{ id: 'wamid.X' }] })) };
    });
    const { mediaId } = await sender.uploadMedia(ONE_PIXEL_PNG, 'image/png', 'hero.png');
    expect(mediaId).toBe('media-1');
    expect(calls[0]?.url).toBe('https://graph.facebook.com/v21.0/12345/media');
    expect(calls[0]?.body).toBeInstanceOf(FormData);
    const img = await sender.sendImage('+254700000000', mediaId, 'hello');
    expect(img.messageId).toBe('wamid.X');
    const payload = JSON.parse(calls[1]!.body as string) as { to: string; type: string; image: { id: string; caption: string } };
    expect(payload).toMatchObject({ to: '254700000000', type: 'image', image: { id: 'media-1', caption: 'hello' } });
    await sender.sendDocument('+254700000000', mediaId, 'report.pdf');
    expect(JSON.parse(calls[2]!.body as string)).toMatchObject({ type: 'document', document: { filename: 'report.pdf' } });
    expect(() => new CloudApiWhatsAppSender('', '1')).toThrow(/fail closed/);
  });
});

describe('stub renderer', () => {
  it('produces a png, a pdf and cid-ready html deterministically', async () => {
    const doc = {
      version: '1', report_id: 'r', kind: 'weekly', locale: 'en', period_label: '5 to 11 October 2026', title: 'Your week in money',
      sections: [
        { type: 'hero', total_out: 'KSh 1', delta: 'KSh 0', delta_direction: 'flat', verdict: 'v', tally: [] },
        { type: 'chart', chart_id: 'donut', chart_type: 'donut', title: 't', data_ref: '/categories', alt_text: 'a' },
        { type: 'footer', accounts_covered: [], computed_note: 'n', unknown_count: '0' },
      ],
      whatsapp: { caption: 'c', hero_chart_ids: ['donut'] },
      email: { subject: 's', preheader: 'p' },
      meta: { generated_at: '2026-10-12T00:00:00+03:00', facts_version: '1', writer: 'fallback', model: null, input_tokens: 0, output_tokens: 0, cost_usd: 0, fact_check: { passed: true, violations: [], attempts: 1 } },
    } as const;
    const r = new StubRenderer();
    const opts = { theme: 'light' as const, locale: 'en' as const, baseUrl: 'https://app.test', reportUrl: 'https://app.test/r/tok' };
    const a = await r.render(doc as never, {} as never, opts);
    const b = await r.render(doc as never, {} as never, opts);
    expect(a.heroPng.byteLength).toBeGreaterThan(50);
    expect(Object.keys(a.chartPngs)).toEqual(['donut']);
    expect(new TextDecoder().decode(a.pdf.slice(0, 8))).toBe('%PDF-1.4');
    expect(a.emailHtml).toContain('cid:hero');
    expect(a.emailHtml).toContain('cid:donut');
    expect(a.emailText).toContain('https://app.test/r/tok');
    expect(a).toEqual(b);
  });
});
