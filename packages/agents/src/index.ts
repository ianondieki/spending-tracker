/** Workflow steps in order. Only `insight-select` and `write` may call a model; the rest are deterministic. */
export const WORKFLOW_STEPS = [
  'collect',
  'insight-select',
  'write',
  'check',
  'render',
  'deliver',
] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export type Env = Readonly<Record<string, string | undefined>>;

/**
 * AI is on only when AI_ENABLED is exactly "true" and a key is present. Anything else means the
 * numbers-only fallback report (fail closed; the report still goes out, with computed numbers only).
 */
export function isAiEnabled(env: Env): boolean {
  const key = env['ANTHROPIC_API_KEY'];
  return env['AI_ENABLED'] === 'true' && typeof key === 'string' && key.length > 0;
}
