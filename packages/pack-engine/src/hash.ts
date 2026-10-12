import { createHash } from 'node:crypto';

/** SHA-256 of the exact message body (the body itself never leaves the device; only this hash syncs). */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * A deterministic RFC 4122-shaped UUID derived from a seed. The same message parsed twice (or on two engines) gets
 * the same id, which keeps the demo seed, the Android demo mode and the backend in agreement.
 */
export function deterministicUuid(seed: string): string {
  const hex = sha256Hex(seed).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '89ab'[parseInt(hex[16]!, 16) % 4]!;
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
