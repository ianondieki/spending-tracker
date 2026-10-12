import type { Drilldown } from '../contracts/facts-sheet.js';
import { NAIROBI_OFFSET_MS } from '../period.js';

export const DAY_MS = 86_400_000;

type Filter = Drilldown['filter'];

export function drill(filter: Filter): Drilldown {
  return { kind: 'transactions', filter };
}

/** Integer division rounded half up (away from zero), exact for safe integers. */
export function divRound(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0) {
    throw new TypeError(`divRound: expected safe integers and a positive divisor, got ${n} / ${d}`);
  }
  const sign = n < 0 ? -1 : 1;
  const a = Math.abs(n);
  let q = Math.floor(a / d);
  let r = a - q * d;
  while (r < 0) { q -= 1; r += d; }
  while (r >= d) { q += 1; r -= d; }
  return sign * (2 * r >= d ? q + 1 : q);
}

export function mulSafe(a: number, b: number): number {
  const p = a * b;
  if (!Number.isSafeInteger(p)) throw new TypeError(`mulSafe: ${a} * ${b} is not a safe integer`);
  return p;
}

/** Median of integer cents, rounded half up when the count is even. */
export function medianCents(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return hi;
  const lo = sorted[mid - 1] ?? 0;
  return divRound(lo + hi, 2);
}

/** Plain median (may be fractional); for day gaps. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return hi;
  return ((sorted[mid - 1] ?? 0) + hi) / 2;
}

/** An instant as ISO 8601 in Nairobi time with the +03:00 offset, e.g. 2026-10-01T09:10:00+03:00. */
export function isoNairobi(ms: number): string {
  const d = new Date(ms + NAIROBI_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+03:00`;
}

/** Plain string ordering, independent of the runtime locale. */
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Groups items by key preserving first-seen order. */
export function groupBy<T>(items: Iterable<T>, keyOf: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
