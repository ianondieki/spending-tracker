import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Db } from '@hesabu/db';
import { Hono } from 'hono';

import type { ApiConfig } from '../env.js';

type WaStatus = { id?: string; status?: string; errors?: { title?: string; message?: string }[] };
type WaMessage = { from?: string; type?: string; text?: { body?: string } };
interface WaPayload {
  entry?: { changes?: { value?: { statuses?: WaStatus[]; messages?: WaMessage[] } }[] }[];
}

const STATUS_MAP: Record<string, 'sent' | 'delivered' | 'read' | 'failed'> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

export function verifyMetaSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  return expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/** Meta WhatsApp Cloud API webhook: verification handshake, delivery statuses, inbound JOIN/STOP. */
export function whatsappWebhook(db: Db, config: ApiConfig): Hono {
  const r = new Hono();

  r.get('/webhooks/whatsapp', (c) => {
    if (!config.whatsappVerifyToken) return c.text('WHATSAPP_VERIFY_TOKEN is not set', 503);
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge') ?? '';
    if (mode === 'subscribe' && token === config.whatsappVerifyToken) return c.text(challenge, 200);
    return c.text('forbidden', 403);
  });

  r.post('/webhooks/whatsapp', async (c) => {
    const raw = await c.req.text();
    if (config.whatsappAppSecret && !verifyMetaSignature(raw, c.req.header('x-hub-signature-256'), config.whatsappAppSecret)) {
      return c.text('bad signature', 401);
    }
    let payload: WaPayload;
    try {
      payload = JSON.parse(raw) as WaPayload;
    } catch {
      return c.text('ok', 200); // Meta retries on non-200; a malformed body is not worth a retry storm
    }
    let statuses = 0;
    let commands = 0;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const s of change.value?.statuses ?? []) {
          const mapped = s.status ? STATUS_MAP[s.status] : undefined;
          if (!s.id || !mapped) continue;
          const err = s.errors?.[0] ? `${s.errors[0].title ?? ''} ${s.errors[0].message ?? ''}`.trim() : null;
          const hit = await db.system.updateDeliveryByProviderMessageId(s.id, mapped, mapped === 'failed' ? err : null);
          if (hit) {
            statuses += 1;
            await db.forUser(hit.user_id).audit('webhook:whatsapp', `delivery.${mapped}`, { report_id: hit.report_id });
          }
        }
        for (const m of change.value?.messages ?? []) {
          if (m.type !== 'text' || !m.from || !/^\d{7,15}$/.test(m.from)) continue;
          const from = `+${m.from}`;
          const text = (m.text?.body ?? '').trim().toUpperCase();
          if (text === 'STOP') {
            const userId = await db.system.findUserByWhatsapp(from);
            if (!userId) continue;
            const tenant = db.forUser(userId);
            await tenant.revokeConsent('whatsapp_delivery');
            await tenant.audit('webhook:whatsapp', 'consent.revoked', { purpose: 'whatsapp_delivery' });
            commands += 1;
          } else {
            // "JOIN <code>": the code names the account, the sender's number is what gets proven (M2, B1).
            const join = /^JOIN\s+([A-Z0-9]{6,12})$/.exec(text);
            if (!join) continue;
            const userId = await db.system.findUserByJoinCode(join[1] ?? '');
            if (!userId) continue;
            await db.system.bindVerifiedWhatsapp(userId, from);
            commands += 1;
          }
        }
      }
    }
    return c.json({ ok: true, statuses, commands });
  });

  return r;
}
