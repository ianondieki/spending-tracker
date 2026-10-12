import { Hono } from 'hono';

import type { AppVars } from '../app.js';
import { errorBody, parseBody } from '../app.js';
import { ExtractBodySchema } from '../schemas.js';

export interface ExtractItem {
  sender: string;
  body_redacted: string;
  received_at: string;
}

/** Abstracts `@hesabu/agents` extraction so the API never holds an API key itself in tests. */
export interface Extractor {
  readonly enabled: boolean;
  extract(items: readonly ExtractItem[], userId: string): Promise<{ proposals: unknown[] }>;
}

export function extractRoute(extractor: Extractor | undefined): Hono<{ Variables: AppVars }> {
  const r = new Hono<{ Variables: AppVars }>();
  r.post('/v1/unknown-messages/extract', async (c) => {
    const body = await parseBody(c, ExtractBodySchema);
    if (!body.ok) return body.res;
    const tenant = c.get('tenant');
    if (!(await tenant.hasConsent('ai_fallback'))) {
      return c.json(errorBody('consent_required', 'the ai_fallback consent has not been granted'), 403);
    }
    if (!extractor || !extractor.enabled) return c.json(errorBody('ai_unavailable', 'AI extraction is switched off'), 503);
    if (body.value.items.length === 0) return c.json({ proposals: [] });
    const result = await extractor.extract(body.value.items, tenant.userId);
    await tenant.audit(`device:${c.get('deviceId')}`, 'unknown_messages.extract', { items: body.value.items.length, proposals: result.proposals.length });
    return c.json({ proposals: result.proposals });
  });
  return r;
}
