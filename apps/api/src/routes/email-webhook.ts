import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Db } from '@hesabu/db';
import { Hono } from 'hono';

import type { ApiConfig } from '../env.js';

interface ResendEvent {
  type?: string;
  data?: { email_id?: string; to?: string[]; bounce?: { message?: string } };
}

const EVENT_MAP: Record<string, 'sent' | 'delivered' | 'failed'> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'failed',
  'email.complained': 'failed',
  'email.delivery_delayed': 'sent',
};

/** Svix-style signature used by Resend: `v1,<base64 hmac(sha256, secret, "<id>.<timestamp>.<body>")>`. */
export function verifySvixSignature(
  rawBody: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
  now: Date = new Date(),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now.getTime() / 1000 - ts) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest('base64');
  return headers.signature.split(' ').some((part) => {
    const [, sig] = part.split(',');
    return !!sig && sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}

export function emailWebhook(db: Db, config: ApiConfig, now: () => Date = () => new Date()): Hono {
  const r = new Hono();
  r.post('/webhooks/email', async (c) => {
    // Fail closed: in production an unsigned webhook is a disabled webhook (M1).
    if (!config.resendWebhookSecret && config.isProduction) return c.text('RESEND_WEBHOOK_SECRET is not set; webhook disabled', 503);
    const raw = await c.req.text();
    if (config.resendWebhookSecret) {
      const ok = verifySvixSignature(
        raw,
        { id: c.req.header('svix-id'), timestamp: c.req.header('svix-timestamp'), signature: c.req.header('svix-signature') },
        config.resendWebhookSecret,
        now(),
      );
      if (!ok) return c.text('bad signature', 401);
    }
    let event: ResendEvent;
    try {
      event = JSON.parse(raw) as ResendEvent;
    } catch {
      return c.text('ok', 200);
    }
    const mapped = event.type ? EVENT_MAP[event.type] : undefined;
    const id = event.data?.email_id;
    if (!mapped || !id) return c.json({ ok: true, handled: false });
    // Enum-like reasons only; provider free text never reaches the app.
    const detail = event.type === 'email.bounced' ? 'bounced' : event.type === 'email.complained' ? 'complaint' : null;
    const hit = await db.system.updateDeliveryByProviderMessageId(id, mapped, mapped === 'failed' ? detail : null);
    if (hit) {
      const tenant = db.forUser(hit.user_id);
      await tenant.audit('webhook:email', `delivery.${mapped}`, { report_id: hit.report_id, event: event.type });
      if (event.type === 'email.complained' || event.type === 'email.bounced') {
        await tenant.revokeConsent('email_delivery');
      }
    }
    return c.json({ ok: true, handled: !!hit });
  });
  return r;
}
