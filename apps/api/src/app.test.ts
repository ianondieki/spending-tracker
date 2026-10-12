import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await createApp().request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; timeZone: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api');
    expect(body.timeZone).toBe('Africa/Nairobi');
  });

  it('404s unknown routes', async () => {
    const res = await createApp().request('/nope');
    expect(res.status).toBe(404);
  });
});
