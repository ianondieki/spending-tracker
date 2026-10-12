import { describe, expect, it } from 'vitest';

import { hashToken, signDeviceToken, signReportLinkToken, verifyDeviceToken, verifyReportLinkToken } from './tokens.js';

const secret = 'test-secret-with-enough-length-0123';

describe('device tokens', () => {
  it('round-trips and rejects tampering', () => {
    const t = signDeviceToken({ user_id: 'u1', device_id: 'd1', iat: 1 }, secret);
    expect(verifyDeviceToken(t, secret)).toEqual({ user_id: 'u1', device_id: 'd1', iat: 1 });
    const [payload, sig] = t.split('.') as [string, string];
    const forged = `${Buffer.from(JSON.stringify({ user_id: 'u2', device_id: 'd1', iat: 1 })).toString('base64url')}.${sig}`;
    expect(verifyDeviceToken(forged, secret)).toBeNull();
    expect(verifyDeviceToken(`${payload}.AAAA`, secret)).toBeNull();
    expect(verifyDeviceToken('garbage', secret)).toBeNull();
    expect(verifyDeviceToken(t, 'another-secret-with-enough-length')).toBeNull();
  });

  it('fails closed without a secret', () => {
    expect(() => signDeviceToken({ user_id: 'u', device_id: 'd', iat: 1 }, undefined)).toThrow(/DEVICE_TOKEN_SECRET/);
    expect(() => verifyDeviceToken('a.b', '')).toThrow(/fail closed/);
    expect(() => verifyDeviceToken('a.b', 'short')).toThrow(/16 characters/);
  });
});

describe('report link tokens', () => {
  it('expire and hash', () => {
    const live = signReportLinkToken({ report_id: 'r1', exp: 2_000_000_000 }, secret);
    expect(verifyReportLinkToken(live, secret, new Date(1_000_000_000_000))).toEqual({ report_id: 'r1', exp: 2_000_000_000 });
    const dead = signReportLinkToken({ report_id: 'r1', exp: 1 }, secret);
    expect(verifyReportLinkToken(dead, secret)).toBeNull();
    expect(hashToken(live)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(live)).not.toBe(hashToken(dead));
  });
});
