/**
 * Token accounting and the daily budget. Every model call is recorded with its token counts and cost; the
 * guard refuses a call when AI is off, the key is missing, the kill switch is on, or today's spend has reached
 * the cap. No PII is ever recorded here: only step names, model ids, counts and money.
 */
import type { AiConfig } from './env.js';

/** USD per million tokens. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
}

export const PRICING: Readonly<Record<string, ModelPrice>> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};

/** The most expensive rate in the table, per field; used for a model the table does not know (fail closed). */
export const CONSERVATIVE_PRICE: ModelPrice = Object.values(PRICING).reduce<ModelPrice>(
  (acc, p) => ({
    input: Math.max(acc.input, p.input),
    output: Math.max(acc.output, p.output),
    cacheWrite: Math.max(acc.cacheWrite, p.cacheWrite),
    cacheRead: Math.max(acc.cacheRead, p.cacheRead),
  }),
  { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
);

export interface Usage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_input_tokens: number;
  readonly cache_creation_input_tokens: number;
}

export const ZERO_USAGE: Usage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
  };
}

export function priceFor(model: string): ModelPrice {
  return Object.hasOwn(PRICING, model)
    ? (PRICING[model] ?? CONSERVATIVE_PRICE)
    : CONSERVATIVE_PRICE;
}

/** Cost of one call in USD (unrounded). An unknown model is priced at the highest known rates. */
export function estimateCostUsd(model: string, usage: Usage): number {
  const p = priceFor(model);
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      usage.cache_creation_input_tokens * p.cacheWrite +
      usage.cache_read_input_tokens * p.cacheRead) /
    1_000_000
  );
}

/** Rounds a USD amount to a millionth of a dollar for display and storage. */
export function roundUsd(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export interface CostEntry {
  readonly step: string;
  readonly model: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read: number;
  readonly cache_write: number;
  readonly cost_usd: number;
  /** ISO 8601 instant. */
  readonly at: string;
}

export interface CostLedger {
  record(entry: CostEntry): Promise<void>;
  /** Sum of `cost_usd` for entries on the same Africa/Nairobi calendar day as `now`. */
  spentTodayUsd(now: Date): Promise<number>;
}

export function costEntry(step: string, model: string, usage: Usage, at: Date): CostEntry {
  return {
    step,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read: usage.cache_read_input_tokens,
    cache_write: usage.cache_creation_input_tokens,
    cost_usd: estimateCostUsd(model, usage),
    at: at.toISOString(),
  };
}

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The Africa/Nairobi calendar date (YYYY-MM-DD) of an instant. Nairobi is UTC+03:00 with no DST. */
export function nairobiDay(instant: Date | string): string {
  const ms = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  return new Date(ms + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

export class InMemoryCostLedger implements CostLedger {
  readonly entries: CostEntry[] = [];

  async record(entry: CostEntry): Promise<void> {
    this.entries.push(entry);
  }

  async spentTodayUsd(now: Date): Promise<number> {
    const today = nairobiDay(now);
    return this.entries
      .filter((e) => nairobiDay(e.at) === today)
      .reduce((sum, e) => sum + e.cost_usd, 0);
  }
}

/**
 * Decides whether a model call may be made right now. `killSwitch` can be flipped at runtime by an operator;
 * when it is on, nothing is spent and every report uses the numbers-only fallback.
 */
export class BudgetGuard {
  killSwitch: boolean;
  private readonly config: AiConfig;
  private readonly ledger: CostLedger;

  constructor(opts: { config: AiConfig; ledger: CostLedger; killSwitch?: boolean }) {
    this.config = opts.config;
    this.ledger = opts.ledger;
    this.killSwitch = opts.killSwitch ?? false;
  }

  async canSpend(now: Date): Promise<boolean> {
    if (this.killSwitch) return false;
    if (!this.config.enabled || this.config.apiKey === null) return false;
    if (!(this.config.dailyBudgetUsd > 0)) return false;
    const spent = await this.ledger.spentTodayUsd(now);
    return spent < this.config.dailyBudgetUsd;
  }
}
