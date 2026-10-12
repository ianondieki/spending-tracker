/**
 * HMAC-signed tokens: device tokens (API auth) and report-link tokens (public /r/<token>). Both fail
 * closed: no secret, no token. Tokens are `base64url(payload).base64url(hmac-sha256)`; only the SHA-256
 * of a report-link token is stored (report_links.token_hash).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const b64u = (buf: Buffer | string): string => Buffer.from(buf).toString('base64url');
const fromB64u = (s: string): Buffer => Buffer.from(s, 'base64url');

function requireSecret(secret: string | undefined, name: string): string {
  if (!secret || secret.length < 16) {
    throw new Error(`${name} is missing or shorter than 16 characters; refusing to sign or verify (fail closed)`);
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return b64u(createHmac('sha256', secret).update(payload).digest());
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const DEVICE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface DeviceTokenClaims {
  readonly user_id: string;
  /** The device row id (uuid), never the device's secret id. */
  readonly device: string;
  readonly iat: number; // epoch seconds
  readonly exp: number; // epoch seconds; the app re-registers on 401
}

/** SHA-256 of the device's secret id: what the database stores and compares (M4). */
export function hashDeviceId(deviceId: string): string {
  return createHash('sha256').update(deviceId, 'utf8').digest('hex');
}

export function signDeviceToken(claims: Omit<DeviceTokenClaims, 'exp'> & { exp?: number }, secret: string | undefined): string {
  const s = requireSecret(secret, 'DEVICE_TOKEN_SECRET');
  const full: DeviceTokenClaims = { ...claims, exp: claims.exp ?? claims.iat + DEVICE_TOKEN_TTL_SECONDS };
  const payload = b64u(JSON.stringify(full));
  return `${payload}.${sign(payload, s)}`;
}

/** Signature, shape and expiry; the caller still checks the device row exists and is not revoked (M3). */
export function verifyDeviceToken(token: string, secret: string | undefined, now: Date = new Date()): DeviceTokenClaims | null {
  const s = requireSecret(secret, 'DEVICE_TOKEN_SECRET');
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !verifySignature(payload, signature, s)) return null;
  try {
    const claims = JSON.parse(fromB64u(payload).toString('utf8')) as Partial<DeviceTokenClaims>;
    if (typeof claims.user_id !== 'string' || typeof claims.device !== 'string' || typeof claims.iat !== 'number' || typeof claims.exp !== 'number') return null;
    if (claims.exp * 1000 <= now.getTime()) return null;
    return { user_id: claims.user_id, device: claims.device, iat: claims.iat, exp: claims.exp };
  } catch {
    return null;
  }
}

export interface ReportLinkClaims {
  readonly report_id: string;
  readonly exp: number; // epoch seconds
  /** Random per link, so two links for the same report at the same expiry are still distinct tokens. */
  readonly nonce?: string;
}

export function signReportLinkToken(claims: ReportLinkClaims, secret: string | undefined): string {
  const s = requireSecret(secret, 'REPORT_LINK_SECRET');
  const payload = b64u(JSON.stringify({ ...claims, nonce: claims.nonce ?? randomBytes(6).toString('base64url') }));
  return `${payload}.${sign(payload, s)}`;
}

/** Signature and expiry check only; the caller still looks the hash up in report_links (revocation). */
export function verifyReportLinkToken(token: string, secret: string | undefined, now: Date = new Date()): ReportLinkClaims | null {
  const s = requireSecret(secret, 'REPORT_LINK_SECRET');
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !verifySignature(payload, signature, s)) return null;
  try {
    const claims = JSON.parse(fromB64u(payload).toString('utf8')) as Partial<ReportLinkClaims>;
    if (typeof claims.report_id !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp * 1000 <= now.getTime()) return null;
    return { report_id: claims.report_id, exp: claims.exp, ...(typeof claims.nonce === 'string' ? { nonce: claims.nonce } : {}) };
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
