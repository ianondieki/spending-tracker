import { describe, expect, it } from 'vitest';

import { S3Storage } from './storage.js';
import { DEVICE_TOKEN_TTL_SECONDS, hashDeviceId, hashToken, signArtefactToken, signDeviceToken, signReportLinkToken, verifyArtefactToken, verifyDeviceToken, verifyReportLinkToken } from './tokens.js';

const secret = 'test-secret-with-enough-length-0123';

describe('device tokens', () => {
  it('round-trips, expires after 30 days and rejects tampering', () => {
    const now = new Date(1_000_000_000_000);
    const iat = 1_000_000_000;
    const t = signDeviceToken({ user_id: 'u1', device: 'row-1', iat }, secret);
    expect(verifyDeviceToken(t, secret, now)).toEqual({ user_id: 'u1', device: 'row-1', iat, exp: iat + DEVICE_TOKEN_TTL_SECONDS });
    expect(verifyDeviceToken(t, secret, new Date((iat + DEVICE_TOKEN_TTL_SECONDS) * 1000))).toBeNull();
    expect(verifyDeviceToken(t, secret, new Date((iat + DEVICE_TOKEN_TTL_SECONDS - 1) * 1000))).not.toBeNull();
    expect(hashDeviceId('phone-uuid')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDeviceId('phone-uuid')).not.toBe(hashDeviceId('phone-uuid2'));
    const [payload, sig] = t.split('.') as [string, string];
    const forged = `${Buffer.from(JSON.stringify({ user_id: 'u2', device: 'row-1', iat, exp: iat + 999 })).toString('base64url')}.${sig}`;
    expect(verifyDeviceToken(forged, secret)).toBeNull();
    expect(verifyDeviceToken(`${payload}.AAAA`, secret)).toBeNull();
    expect(verifyDeviceToken('garbage', secret)).toBeNull();
    expect(verifyDeviceToken(t, 'another-secret-with-enough-length')).toBeNull();
  });

  it('fails closed without a secret', () => {
    expect(() => signDeviceToken({ user_id: 'u', device: 'd', iat: 1 }, undefined)).toThrow(/DEVICE_TOKEN_SECRET/);
    expect(() => verifyDeviceToken('a.b', '')).toThrow(/fail closed/);
    expect(() => verifyDeviceToken('a.b', 'short')).toThrow(/16 characters/);
  });
});

describe('report link tokens', () => {
  it('expire and hash', () => {
    const live = signReportLinkToken({ report_id: 'r1', exp: 2_000_000_000 }, secret);
    expect(verifyReportLinkToken(live, secret, new Date(1_000_000_000_000))).toMatchObject({ report_id: 'r1', exp: 2_000_000_000 });
    expect(signReportLinkToken({ report_id: 'r1', exp: 2_000_000_000 }, secret)).not.toBe(live);
    expect(signReportLinkToken({ report_id: 'r1', exp: 2_000_000_000, nonce: 'fixed' }, secret)).toBe(signReportLinkToken({ report_id: 'r1', exp: 2_000_000_000, nonce: 'fixed' }, secret));
    const dead = signReportLinkToken({ report_id: 'r1', exp: 1 }, secret);
    expect(verifyReportLinkToken(dead, secret)).toBeNull();
    expect(hashToken(live)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(live)).not.toBe(hashToken(dead));
  });
});

describe('artefact access (M6)', () => {
  it('artefact tokens are short-lived and bound to one key', () => {
    const t = signArtefactToken({ key: 'reports/u/r/hero.png', exp: 2_000_000_000 }, secret);
    expect(verifyArtefactToken(t, secret, new Date(1_000_000_000_000))).toEqual({ key: 'reports/u/r/hero.png', exp: 2_000_000_000 });
    expect(verifyArtefactToken(t, secret, new Date(2_000_000_000_000))).toBeNull();
    const [, sig] = t.split('.') as [string, string];
    const other = `${Buffer.from(JSON.stringify({ key: 'reports/u/r/report.pdf', exp: 2_000_000_000 })).toString('base64url')}.${sig}`;
    expect(verifyArtefactToken(other, secret)).toBeNull();
    // Not interchangeable with report-link tokens signed by the same secret.
    expect(verifyArtefactToken(signReportLinkToken({ report_id: 'reports/u/r/hero.png', exp: 2_000_000_000 }, secret), secret)).toBeNull();
  });

  it('S3 storage presigns 15-minute reads offline and never returns a bare bucket URL', async () => {
    const s3 = new S3Storage({ endpoint: 'http://localhost:9000', bucket: 'hesabu', accessKey: 'a', secretKey: 'b', region: 'us-east-1' });
    const url = await s3.signedGetUrl('reports/u/r/hero.png', 900);
    expect(url).toMatch(/^http:\/\/localhost:9000\/hesabu\/reports\/u\/r\/hero\.png\?/);
    expect(url).toContain('X-Amz-Signature=');
    expect(url).toContain('X-Amz-Expires=900');
  });
});
