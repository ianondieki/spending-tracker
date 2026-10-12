import { hashToken, signReportLinkToken, type TenantDb } from '@hesabu/db';

/** Creates a signed, expiring web link for a report and records its hash so it can be revoked. */
export async function createSignedReportLink(
  tenant: TenantDb,
  reportId: string,
  opts: { secret: string | undefined; ttlDays: number; appBaseUrl: string; now?: Date },
): Promise<{ token: string; url: string; expiresAt: string }> {
  const now = opts.now ?? new Date();
  const exp = Math.floor(now.getTime() / 1000) + Math.max(1, opts.ttlDays) * 86_400;
  const token = signReportLinkToken({ report_id: reportId, exp }, opts.secret);
  const expiresAt = new Date(exp * 1000).toISOString();
  await tenant.createReportLink(reportId, hashToken(token), expiresAt);
  return { token, url: `${opts.appBaseUrl}/r/${token}`, expiresAt };
}
