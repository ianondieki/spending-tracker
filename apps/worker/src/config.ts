export type Env = Readonly<Record<string, string | undefined>>;

const nonEmpty = (v: string | undefined): string | undefined => (v && v.length > 0 ? v : undefined);

export interface WorkerConfig {
  readonly appBaseUrl: string;
  readonly reportLinkSecret: string | undefined;
  readonly reportLinkTtlDays: number;
  readonly resend: { apiKey: string; from: string } | null;
  readonly whatsapp: { token: string; phoneNumberId: string; apiVersion: string } | null;
  readonly s3: { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string; publicBaseUrl: string | null } | null;
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
  const s3Endpoint = nonEmpty(env['S3_ENDPOINT']);
  const s3Bucket = nonEmpty(env['S3_BUCKET']);
  const s3Access = nonEmpty(env['S3_ACCESS_KEY']);
  const s3Secret = nonEmpty(env['S3_SECRET_KEY']);
  const s3Any = s3Endpoint || s3Bucket || s3Access || s3Secret;
  const s3All = s3Endpoint && s3Bucket && s3Access && s3Secret;
  if (s3Any && !s3All) {
    throw new Error('S3 is partially configured; set all of S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY or none (fail closed)');
  }
  return {
    appBaseUrl: (env['APP_BASE_URL'] ?? 'http://localhost:3000').replace(/\/$/, ''),
    reportLinkSecret: nonEmpty(env['REPORT_LINK_SECRET']),
    reportLinkTtlDays: Number(env['REPORT_LINK_TTL_DAYS'] ?? 30) || 30,
    resend: resendKey ? { apiKey: resendKey, from: env['RESEND_FROM'] ?? 'Hesabu <onboarding@resend.dev>' } : null,
    whatsapp: waToken && waPhone ? { token: waToken, phoneNumberId: waPhone, apiVersion: env['WHATSAPP_API_VERSION'] ?? 'v21.0' } : null,
    s3: s3All
      ? {
          endpoint: s3Endpoint,
          bucket: s3Bucket,
          accessKey: s3Access,
          secretKey: s3Secret,
          region: env['S3_REGION'] ?? 'us-east-1',
          publicBaseUrl: nonEmpty(env['S3_PUBLIC_BASE_URL']) ?? null,
        }
      : null,
    storageDir: env['STORAGE_DIR'] ?? '.hesabu-storage',
    isProduction: env['NODE_ENV'] === 'production',
  };
}
