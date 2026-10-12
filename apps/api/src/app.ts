import { Hono } from 'hono';

export const API_VERSION = '0.0.0';

export function createApp(): Hono {
  const app = new Hono();

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'api',
      version: API_VERSION,
      timeZone: 'Africa/Nairobi',
      time: new Date().toISOString(),
    }),
  );

  return app;
}

export const app = createApp();
