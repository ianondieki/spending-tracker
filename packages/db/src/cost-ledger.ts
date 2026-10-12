/**
 * Cost ledger backed by `ai_usage`, structurally compatible with `@hesabu/agents`' `CostLedger` (this package
 * does not depend on agents). Spend is summed across every user: the daily USD budget is global.
 */
import type { Db } from './index.js';

export interface LedgerEntry {
  readonly step: string;
  readonly model: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read: number;
  readonly cache_write: number;
  readonly cost_usd: number;
  readonly at: string;
}

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Midnight at the start of the Nairobi calendar day containing `now`, as a UTC instant. */
export function startOfNairobiDay(now: Date): Date {
  const local = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - NAIROBI_OFFSET_MS);
}

export class DbCostLedger {
  constructor(
    private readonly db: Db,
    private readonly userId: string,
    private readonly reportId: string | null = null,
  ) {}

  async record(entry: LedgerEntry): Promise<void> {
    await this.db.forUser(this.userId).recordAiUsage({
      report_id: this.reportId,
      step: entry.step,
      model: entry.model,
      input_tokens: entry.input_tokens,
      output_tokens: entry.output_tokens,
      cache_read: entry.cache_read,
      cache_write: entry.cache_write,
      cost_usd: entry.cost_usd,
    });
  }

  async spentTodayUsd(now: Date): Promise<number> {
    return this.db.system.aiSpendUsdSince(startOfNairobiDay(now));
  }
}
