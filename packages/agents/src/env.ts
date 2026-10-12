/**
 * AI configuration from the environment. Fails closed: anything other than an explicit `AI_ENABLED=true` with a
 * key present means the numbers-only fallback report (it still goes out, with computed numbers only).
 */
export type Env = Readonly<Record<string, string | undefined>>;

/** The only model this package calls (see the claude-api skill: Claude Opus 5.5 is the default). */
export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_DAILY_BUDGET_USD = 2;

export interface AiConfig {
  readonly enabled: boolean;
  readonly model: string;
  /** Global daily spend cap across every model call (Africa/Nairobi calendar day). */
  readonly dailyBudgetUsd: number;
  readonly apiKey: string | null;
}

/**
 * AI is on only when AI_ENABLED is exactly "true" and a key is present. Anything else means the
 * numbers-only fallback report.
 */
export function isAiEnabled(env: Env): boolean {
  const key = env['ANTHROPIC_API_KEY'];
  return env['AI_ENABLED'] === 'true' && typeof key === 'string' && key.length > 0;
}

/**
 * `AI_DAILY_BUDGET_USD` defaults to 2 when unset or empty. A value that is not a finite, non-negative number
 * becomes 0 (no spend) rather than the default, so a typo can never raise the cap.
 */
export function parseDailyBudget(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_BUDGET_USD;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function readAiConfig(env: Env): AiConfig {
  const key = env['ANTHROPIC_API_KEY'];
  return {
    enabled: isAiEnabled(env),
    model: DEFAULT_MODEL,
    dailyBudgetUsd: parseDailyBudget(env['AI_DAILY_BUDGET_USD']),
    apiKey: typeof key === 'string' && key.length > 0 ? key : null,
  };
}
