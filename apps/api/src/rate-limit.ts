/**
 * A small in-memory fixed-window limiter (per process). Enough for the sprint's single instance; a shared store
 * (Redis or Postgres) replaces `Store` when the API runs more than one machine.
 */
import type { Context, MiddlewareHandler } from 'hono';

export interface RateLimitRule {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per key per window. */
  limit: number;
  /** Derives the bucket key; return null to skip limiting for this request. */
  keyOf: (c: Context) => string | null;
}

export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Returns the remaining allowance after counting this hit, or -1 when over the limit. */
  hit(key: string, rule: RateLimitRule): { remaining: number; retryAfterSeconds: number } {
    const t = this.now().getTime();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + rule.windowMs };
      this.buckets.set(key, b);
      if (this.buckets.size > 50_000) this.sweep(t);
    }
    b.count += 1;
    return { remaining: Math.max(-1, rule.limit - b.count), retryAfterSeconds: Math.ceil((b.resetAt - t) / 1000) };
  }

  private sweep(t: number): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= t) this.buckets.delete(k);
  }

  middleware(name: string, rule: RateLimitRule): MiddlewareHandler {
    return async (c, next) => {
      const key = rule.keyOf(c);
      if (key === null) return next();
      const r = this.hit(`${name}:${key}`, rule);
      if (r.remaining < 0) {
        c.header('retry-after', String(r.retryAfterSeconds));
        return c.json({ code: 'rate_limited', message: 'too many requests' }, 429);
      }
      return next();
    };
  }
}

/** Client IP from the usual proxy header, else the socket address when the runtime exposes it, else "unknown". */
export function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim().slice(0, 64);
  const real = c.req.header('x-real-ip') ?? c.req.header('fly-client-ip') ?? c.req.header('cf-connecting-ip');
  return (real ?? 'unknown').slice(0, 64);
}

export function bearerKey(c: Context): string | null {
  const h = c.req.header('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7, 7 + 64) : null;
}
