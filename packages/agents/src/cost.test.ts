import { describe, expect, it } from 'vitest';

import {
  addUsage,
  BudgetGuard,
  CONSERVATIVE_PRICE,
  costEntry,
  estimateCostUsd,
  InMemoryCostLedger,
  nairobiDay,
  PRICING,
  roundUsd,
  type Usage,
} from './cost.js';
import { readAiConfig } from './env.js';

const usage = (input: number, output: number, read = 0, write = 0): Usage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
});

const enabled = readAiConfig({
  AI_ENABLED: 'true',
  ANTHROPIC_API_KEY: 'sk-test',
  AI_DAILY_BUDGET_USD: '1',
});

describe('pricing', () => {
  it('prices Claude Opus 5.5 at 4 / 20 / 5 / 0.20 USD per million tokens', () => {
    expect(PRICING['claude-opus-5-5']).toEqual({
      input: 4,
      output: 20,
      cacheWrite: 5,
      cacheRead: 0.2,
    });
    expect(estimateCostUsd('claude-opus-5-5', usage(1_000_000, 0))).toBeCloseTo(4, 10);
    expect(estimateCostUsd('claude-opus-5-5', usage(0, 1_000_000))).toBeCloseTo(20, 10);
    expect(estimateCostUsd('claude-opus-5-5', usage(0, 0, 1_000_000))).toBeCloseTo(0.2, 10);
    expect(estimateCostUsd('claude-opus-5-5', usage(0, 0, 0, 1_000_000))).toBeCloseTo(5, 10);
    expect(estimateCostUsd('claude-opus-5-5', usage(1000, 200, 500, 0))).toBeCloseTo(0.0081, 10);
  });

  it('prices an unknown model at the highest known rates (fail closed)', () => {
    expect(CONSERVATIVE_PRICE.output).toBeGreaterThanOrEqual(20);
    expect(estimateCostUsd('some-new-model', usage(0, 1_000_000))).toBe(CONSERVATIVE_PRICE.output);
  });

  it('adds usage and rounds to a millionth of a dollar', () => {
    expect(addUsage(usage(1, 2, 3, 4), usage(10, 20, 30, 40))).toEqual(usage(11, 22, 33, 44));
    expect(roundUsd(0.123456789)).toBe(0.123457);
  });
});

describe('cost ledger', () => {
  it('records entries and sums only the current Nairobi day', async () => {
    const ledger = new InMemoryCostLedger();
    // 22:00 UTC on 11 October is 01:00 on 12 October in Nairobi.
    await ledger.record(
      costEntry('write', 'claude-opus-5-5', usage(0, 10_000), new Date('2026-10-11T22:00:00Z')),
    );
    await ledger.record(
      costEntry('write', 'claude-opus-5-5', usage(0, 5_000), new Date('2026-10-12T10:00:00Z')),
    );
    await ledger.record(
      costEntry('write', 'claude-opus-5-5', usage(0, 50_000), new Date('2026-10-11T20:59:59Z')),
    );
    expect(await ledger.spentTodayUsd(new Date('2026-10-12T12:00:00Z'))).toBeCloseTo(0.3, 10);
    expect(await ledger.spentTodayUsd(new Date('2026-10-11T12:00:00Z'))).toBeCloseTo(1, 10);
    expect(ledger.entries[0]).toMatchObject({
      step: 'write',
      model: 'claude-opus-5-5',
      output_tokens: 10_000,
      cache_read: 0,
      cache_write: 0,
    });
  });

  it('computes the Nairobi calendar day', () => {
    expect(nairobiDay('2026-10-11T20:59:59Z')).toBe('2026-10-11');
    expect(nairobiDay('2026-10-11T21:00:00Z')).toBe('2026-10-12');
  });
});

describe('budget guard', () => {
  const now = new Date('2026-10-12T10:00:00Z');

  it('allows spend under the daily budget', async () => {
    const guard = new BudgetGuard({ config: enabled, ledger: new InMemoryCostLedger() });
    expect(await guard.canSpend(now)).toBe(true);
  });

  it('refuses when AI is disabled or the key is missing', async () => {
    const ledger = new InMemoryCostLedger();
    expect(await new BudgetGuard({ config: readAiConfig({}), ledger }).canSpend(now)).toBe(false);
    expect(
      await new BudgetGuard({ config: { ...enabled, apiKey: null }, ledger }).canSpend(now),
    ).toBe(false);
    expect(
      await new BudgetGuard({ config: { ...enabled, dailyBudgetUsd: 0 }, ledger }).canSpend(now),
    ).toBe(false);
  });

  it("refuses once today's spend reaches the budget", async () => {
    const ledger = new InMemoryCostLedger();
    const guard = new BudgetGuard({ config: enabled, ledger });
    await ledger.record(costEntry('write', 'claude-opus-5-5', usage(0, 49_999), now));
    expect(await guard.canSpend(now)).toBe(true);
    await ledger.record(costEntry('write', 'claude-opus-5-5', usage(0, 1), now));
    expect(await guard.canSpend(now)).toBe(false);
    expect(await guard.canSpend(new Date('2026-10-13T10:00:00Z'))).toBe(true);
  });

  it('has a kill switch that stops all spend at once', async () => {
    const guard = new BudgetGuard({ config: enabled, ledger: new InMemoryCostLedger() });
    guard.killSwitch = true;
    expect(await guard.canSpend(now)).toBe(false);
    guard.killSwitch = false;
    expect(await guard.canSpend(now)).toBe(true);
    expect(
      await new BudgetGuard({
        config: enabled,
        ledger: new InMemoryCostLedger(),
        killSwitch: true,
      }).canSpend(now),
    ).toBe(false);
  });
});
