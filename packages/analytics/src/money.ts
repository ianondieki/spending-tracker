/**
 * Display formatting for every number a report may show. The formats here are the fact-checker's
 * vocabulary: a numeral in report copy is allowed only if it matches one of these strings exactly.
 *
 *   Money   KSh 12,450        whole shillings, rounded half up (away from zero), negative as KSh -3,400
 *   Delta   KSh +1,200        always signed; zero is KSh 0
 *   Pct     12% / -8%         whole percent
 *   Count   1,204             thousands separated
 */
import type { Count, Delta, Money, Pct } from './contracts/facts-sheet.js';

export const CURRENCY_PREFIX = 'KSh';

function assertSafeInt(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${what}: expected a safe integer, got ${String(value)}`);
  }
}

/** Sums integer amounts; throws on anything that is not a safe integer (numbers are computed, never guessed). */
export function sumMinor(amounts: Iterable<number>): number {
  let total = 0;
  for (const amount of amounts) {
    assertSafeInt(amount, 'sumMinor');
    total += amount;
  }
  assertSafeInt(total, 'sumMinor total');
  return total;
}

/** Cents to whole shillings, rounded half up away from zero: 1250 → 13, -1250 → -13, 1249 → 12. */
export function centsToShillings(cents: number): number {
  assertSafeInt(cents, 'centsToShillings');
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(cents) + 50) / 100);
}

export function groupThousands(n: number): string {
  const abs = Math.abs(Math.trunc(n)).toString();
  return abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoney(cents: number): string {
  const sh = centsToShillings(cents);
  return sh < 0 ? `${CURRENCY_PREFIX} -${groupThousands(sh)}` : `${CURRENCY_PREFIX} ${groupThousands(sh)}`;
}

export function formatSignedMoney(cents: number): string {
  const sh = centsToShillings(cents);
  if (sh === 0) return `${CURRENCY_PREFIX} 0`;
  return sh < 0 ? `${CURRENCY_PREFIX} -${groupThousands(sh)}` : `${CURRENCY_PREFIX} +${groupThousands(sh)}`;
}

export function formatPct(value: number): string {
  assertSafeInt(value, 'formatPct');
  return `${value}%`;
}

export function formatCount(value: number): string {
  assertSafeInt(value, 'formatCount');
  return value < 0 ? `-${groupThousands(value)}` : groupThousands(value);
}

export function money(cents: number): Money {
  return { cents, display: formatMoney(cents) };
}

export function pct(value: number): Pct {
  return { value, display: formatPct(value) };
}

export function count(value: number): Count {
  return { value, display: formatCount(value) };
}

/** Whole-percent ratio, rounded half up away from zero; 0 when the denominator is 0. */
export function ratioPct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const raw = (numerator * 100) / denominator;
  const sign = raw < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(raw) + 0.5);
}

/** Change from `previous` to `current`. Direction `na` when there is no previous value to compare against. */
export function delta(current: number, previous: number): Delta {
  const diff = current - previous;
  const p = previous === 0 ? 0 : ratioPct(diff, previous);
  let direction: Delta['direction'];
  if (previous === 0 && current === 0) direction = 'flat';
  else if (previous === 0) direction = 'na';
  else if (diff > 0) direction = 'up';
  else if (diff < 0) direction = 'down';
  else direction = 'flat';
  return { cents: diff, display: formatSignedMoney(diff), pct: pct(p), direction };
}
