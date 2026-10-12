/**
 * Wires `@hesabu/agents` extraction behind the API's Extractor interface. Enabled only when AI is switched on
 * with a key and the daily budget has headroom; the redaction helper runs again on the server before anything is
 * sent, and the result is proposals only (never written to the ledger).
 */
import { AnthropicModelClient, BudgetGuard, extractUnknownMessages, readAiConfig, redact } from '@hesabu/agents';
import { DbCostLedger, startOfNairobiDay, type Db } from '@hesabu/db';

import type { Env } from './env.js';
import type { ExtractItem, Extractor } from './routes/extract.js';

/** Per-user daily cap on extraction spend (USD), so one user cannot drain the global budget (m2). */
export const DEFAULT_USER_DAILY_BUDGET_USD = 0.25;

export function createExtractor(env: Env, db: Db): Extractor {
  const config = readAiConfig(env);
  const perUser = Number(env['AI_USER_DAILY_BUDGET_USD'] ?? DEFAULT_USER_DAILY_BUDGET_USD);
  const userCap = Number.isFinite(perUser) && perUser > 0 ? perUser : 0;
  return {
    enabled: config.enabled,
    async extract(items: readonly ExtractItem[], userId: string): Promise<{ proposals: unknown[] }> {
      if (!config.enabled) return { proposals: [] };
      const spentToday = await db.forUser(userId).aiSpendUsdSince(startOfNairobiDay(new Date()));
      if (spentToday >= userCap) return { proposals: [] };
      const ledger = new DbCostLedger(db, userId);
      const guard = new BudgetGuard({ config, ledger });
      const client = new AnthropicModelClient({ config, guard, ledger });
      const result = await extractUnknownMessages(
        items.map((i) => ({ sender: redact(i.sender), body_redacted: redact(i.body_redacted), received_at: i.received_at })),
        client,
      );
      return { proposals: result.proposals };
    },
  };
}
