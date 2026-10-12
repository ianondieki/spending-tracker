import { describe, expect, it } from 'vitest';

import { isAiEnabled, WORKFLOW_STEPS } from './index.js';

describe('agents placeholder', () => {
  it('lists the workflow steps in order', () => {
    expect(WORKFLOW_STEPS[0]).toBe('collect');
    expect(WORKFLOW_STEPS.at(-1)).toBe('deliver');
  });

  it('fails closed to numbers-only unless explicitly enabled with a key', () => {
    expect(isAiEnabled({})).toBe(false);
    expect(isAiEnabled({ AI_ENABLED: 'true' })).toBe(false);
    expect(isAiEnabled({ AI_ENABLED: 'yes', ANTHROPIC_API_KEY: 'sk-test' })).toBe(false);
    expect(isAiEnabled({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-test' })).toBe(true);
  });
});
