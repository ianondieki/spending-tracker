import { readStorageConfig } from '@hesabu/db';

export type Env = Readonly<Record<string, string | undefined>>;

const nonEmpty = (v: string | undefined): string | undefined => (v && v.length > 0 ? v : undefined);

export interface WorkerConfig {
  readonly appBaseUrl: string;
  readonly reportLinkSecret: string | undefined;
  readonly reportLinkTtlDays: number;
  readonly resend: { apiKey: string; from: string } | null;
  readonly whatsapp: { token: string; phoneNumberId: string; apiVersion: string } | null;
  readonly s3: { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string } | null;
  readonly storageDir: string;
  readonly isProduction: boolean;
}

/**
 * Every provider is optional and fails closed: when its secrets are missing the worker uses the fake
 * (recording) adapter and marks deliveries `skipped` with a reason, never a half-configured real call.
 */
export function readWorkerConfig(env: Env): WorkerConfig {
  const resendKey = nonEmpty(env['RESEND_API_KEY']);
  const waToken = nonEmpty(env['WHATSAPP_TOKEN']);
  const waPhone = nonEmpty(env['WHATSAPP_PHONE_NUMBER_ID']);
  const storage = readStorageConfig(env);
  return {
    appBaseUrl: (env['APP_BASE_URL'] ?? 'http://localhost:3000').replace(/\/$/, ''),
    reportLinkSecret: nonEmpty(env['REPORT_LINK_SECRET']),
    reportLinkTtlDays: Number(env['REPORT_LINK_TTL_DAYS'] ?? 30) || 30,
    resend: resendKey ? { apiKey: resendKey, from: env['RESEND_FROM'] ?? 'Hesabu <onboarding@resend.dev>' } : null,
    whatsapp: waToken && waPhone ? { token: waToken, phoneNumberId: waPhone, apiVersion: env['WHATSAPP_API_VERSION'] ?? 'v21.0' } : null,
    s3: storage.s3,
    storageDir: storage.storageDir,
    isProduction: env['NODE_ENV'] === 'production',
  };
}
