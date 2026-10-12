import { describe, expect, it } from 'vitest';

import * as agents from './index.js';
import { isAiEnabled, parseDailyBudget, readAiConfig, WORKFLOW_STEPS } from './index.js';

describe('workflow and configuration', () => {
  it('lists the workflow steps in order', () => {
    expect(WORKFLOW_STEPS[0]).toBe('collect');
    expect(WORKFLOW_STEPS.at(-1)).toBe('deliver');
  });

  it('fails closed to numbers-only unless explicitly enabled with a key', () => {
    expect(isAiEnabled({})).toBe(false);
    expect(isAiEnabled({ AI_ENABLED: 'true' })).toBe(false);
    expect(isAiEnabled({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: '' })).toBe(false);
    expect(isAiEnabled({ AI_ENABLED: 'yes', ANTHROPIC_API_KEY: 'sk-test' })).toBe(false);
    expect(isAiEnabled({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-test' })).toBe(true);
  });

  it('reads the AI config with a default daily budget of 2 USD', () => {
    expect(readAiConfig({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-test' })).toEqual({
      enabled: true,
      model: 'claude-opus-5-5',
      dailyBudgetUsd: 2,
      apiKey: 'sk-test',
    });
    expect(readAiConfig({}).apiKey).toBeNull();
    expect(readAiConfig({ AI_DAILY_BUDGET_USD: '0.5' }).dailyBudgetUsd).toBe(0.5);
  });

  it('never raises the budget on a malformed value', () => {
    expect(parseDailyBudget(undefined)).toBe(2);
    expect(parseDailyBudget(' ')).toBe(2);
    expect(parseDailyBudget('lots')).toBe(0);
    expect(parseDailyBudget('-3')).toBe(0);
    expect(parseDailyBudget('Infinity')).toBe(0);
  });

  it('exports the public surface', () => {
    for (const name of [
      'ReportDocumentSchema', 'factCheck', 'writeFallback', 'produceReport', 'insightSelect', 'writeReport',
      'judgeReport', 'extractUnknownMessages', 'redact', 'AnthropicModelClient', 'FakeModelClient', 'BudgetGuard',
      'InMemoryCostLedger', 'PRICING', 'estimateCostUsd', 'ReportDraftSchema', 'WRITE_V1', 'INSIGHT_SELECT_V1',
      'JUDGE_V1', 'EXTRACT_V1',
    ]) {
      expect(agents, name).toHaveProperty(name);
    }
  });
});
