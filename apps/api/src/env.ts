export type Env = Readonly<Record<string, string | undefined>>;

export interface ApiConfig {
  readonly deviceTokenSecret: string | undefined;
  readonly reportLinkSecret: string | undefined;
  readonly whatsappVerifyToken: string | undefined;
  readonly whatsappAppSecret: string | undefined;
  readonly resendWebhookSecret: string | undefined;
  readonly appBaseUrl: string;
  /** This API's own public URL (for the signed artefact route); defaults to http://localhost:<PORT>. */
  readonly apiBaseUrl: string;
  readonly isProduction: boolean;
}

/** Secrets are read once and left undefined when missing; each route that needs one fails closed with 503. */
export function readApiConfig(env: Env): ApiConfig {
  const nonEmpty = (v: string | undefined): string | undefined => (v && v.length > 0 ? v : undefined);
  return {
    deviceTokenSecret: nonEmpty(env['DEVICE_TOKEN_SECRET']),
    reportLinkSecret: nonEmpty(env['REPORT_LINK_SECRET']),
    whatsappVerifyToken: nonEmpty(env['WHATSAPP_VERIFY_TOKEN']),
    whatsappAppSecret: nonEmpty(env['WHATSAPP_APP_SECRET']),
    resendWebhookSecret: nonEmpty(env['RESEND_WEBHOOK_SECRET']),
    appBaseUrl: (env['APP_BASE_URL'] ?? 'http://localhost:3000').replace(/\/$/, ''),
    apiBaseUrl: (env['API_BASE_URL'] ?? `http://localhost:${env['PORT'] ?? '8787'}`).replace(/\/$/, ''),
    isProduction: env['NODE_ENV'] === 'production',
  };
}
