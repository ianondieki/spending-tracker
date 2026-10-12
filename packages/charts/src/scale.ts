/** Linear scales and nice ticks, pure and deterministic. */
export interface Linear {
  (value: number): number;
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
}

export function linear(domain: readonly [number, number], range: readonly [number, number]): Linear {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Linear & { domain: unknown; range: unknown };
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** A step of 1, 2, 2.5 or 5 × 10^n that yields about `count` ticks. */
export function niceStep(max: number, count = 4): number {
  if (max <= 0) return 1;
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  return candidates.find((c) => c >= raw) ?? 10 * pow;
}

export function ticks(min: number, max: number, count = 4): number[] {
  const step = niceStep(Math.max(Math.abs(max), Math.abs(min)), count);
  const out: number[] = [];
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  for (let t = start; t <= end + step / 2; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

/** Domain top rounded up to the next nice step so the top gridline sits above the tallest mark. */
export function niceMax(max: number, count = 4): number {
  const step = niceStep(max, count);
  return Math.max(step, Math.ceil(max / step) * step);
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Fixed-precision string so SVG attributes never carry float noise (deterministic snapshots). */
export function px(n: number): number {
  return Math.round(n * 100) / 100;
}
