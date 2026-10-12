export const ANALYTICS_VERSION = '0.0.0';

/**
 * Sums integer minor-unit amounts. Throws on anything that is not a safe integer so a bad parse can
 * never leak into a report number (principle: numbers are computed, never generated; fail closed).
 */
export function sumMinor(amounts: Iterable<number>): number {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount)) {
      throw new TypeError(`sumMinor: expected a safe integer minor amount, got ${String(amount)}`);
    }
    total += amount;
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('sumMinor: total left the safe integer range');
  }
  return total;
}
