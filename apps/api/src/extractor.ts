/**
 * Wires `@hesabu/agents` extraction behind the API's Extractor interface. Enabled only when AI is
 * switched on with a key; the redaction helper runs again on the server before anything is sent.
 */
import type { Env } from './env.js';
import type { ExtractItem, Extractor } from './routes/extract.js';

interface AgentsModule {
  extractUnknownMessagesWithEnv?: (items: readonly ExtractItem[], env: Env) => Promise<{ proposals: unknown[] }>;
}

export function createExtractor(env: Env): Extractor {
  const enabled = env['AI_ENABLED'] === 'true' && !!env['ANTHROPIC_API_KEY'];
  return {
    enabled,
    async extract(items: readonly ExtractItem[]): Promise<{ proposals: unknown[] }> {
      if (!enabled) return { proposals: [] };
      const agents = (await import('@hesabu/agents')) as unknown as AgentsModule;
      if (!agents.extractUnknownMessagesWithEnv) return { proposals: [] };
      return agents.extractUnknownMessagesWithEnv(items, env);
    },
  };
}
