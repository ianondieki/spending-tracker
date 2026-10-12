/**
 * Money and percentage formatting per `contracts/design-tokens.json` (`money`): `KSh 12,450`, `KSh -1,200`,
 * whole shillings rounded half up, signed deltas `KSh +1,200`. Pure, locale-independent (both en and sw use the
 * same numerals and the same `KSh` symbol), so analytics, charts and the renderer agree to the character.
 */
import type { Count, Delta, Money, Pct } from './types.js';

export const CURRENCY_SYMBOL = 'KSh';

/** Rounds cents to whole shillings, half away from zero, matching the analytics engine. */
export function centsToShillings(cents: number): number {
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(cents) + 50) / 100);
}

export function groupDigits(n: number): string {
  return Math.abs(Math.trunc(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatKsh(cents: number, opts: { readonly signed?: boolean } = {}): string {
  const sh = centsToShillings(cents);
  const sign = sh < 0 ? '-' : opts.signed && sh > 0 ? '+' : '';
  return `${CURRENCY_SYMBOL} ${sign}${groupDigits(sh)}`;
}

export function money(cents: number): Money {
  return { cents, display: formatKsh(cents) };
}

export function pct(value: number): Pct {
  const v = Math.round(value);
  return { value: v, display: `${v}%` };
}

/** Whole percent of `part` in `whole`; 0 when `whole` is 0. */
export function ratioPct(part: number, whole: number): Pct {
  return pct(whole === 0 ? 0 : (part / whole) * 100);
}

export function count(value: number): Count {
  return { value, display: groupDigits(value) };
}

export function delta(current: number, previous: number): Delta {
  const cents = current - previous;
  const direction: Delta['direction'] = previous === 0 && current === 0 ? 'na' : cents > 0 ? 'up' : cents < 0 ? 'down' : 'flat';
  const p = previous === 0 ? pct(0) : pct((cents / previous) * 100);
  return { cents, display: formatKsh(cents, { signed: true }), pct: p, direction };
}

/** Compact axis ticks: 0, 500, 1K, 12.5K, 1.2M (whole shillings in). */
export function compactKsh(shillings: number): string {
  const abs = Math.abs(shillings);
  const sign = shillings < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${trimZero((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${sign}${trimZero((abs / 1_000).toFixed(1))}K`;
  return `${sign}${abs}`;
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Every number-looking token in a piece of copy, used by the fact-checker and the fixture tests. */
export function numbersIn(text: string): string[] {
  return text.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|\d+(?:\.\d+)?%?/g) ?? [];
}
