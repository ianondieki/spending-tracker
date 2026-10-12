import { describe, expect, it } from 'vitest';

import { insightSelect } from './insight-select.js';
import { FakeModelClient, fakeFail, fakeOk } from './model-client.js';
import { INSIGHT_SELECT_V1 } from './prompts/insight-select.v1.js';
import { sampleFacts } from './test-fixtures.js';

const facts = sampleFacts('weekly');
const pick = (...ids: string[]) => ({
  selected: ids.map((id) => ({ id, rationale: `because ${id}` })),
});

describe('insightSelect', () => {
  it('keeps the model order and drops unknown and repeated ids', async () => {
    const client = new FakeModelClient(
      fakeOk(pick('ins_sub', 'made_up', 'ins_fees', 'ins_sub', 'ins_new')),
    );
    const result = await insightSelect(facts, 'weekly', client);
    expect(result.source).toBe('model');
    expect(result.selected.map((s) => s.id)).toEqual(['ins_sub', 'ins_fees', 'ins_new']);
    expect(result.selected[0]?.rationale).toBe('because ins_sub');
  });

  it('caps the selection at 7 for weekly', async () => {
    const ids = facts.candidate_insights.map((c) => c.id).reverse();
    const result = await insightSelect(facts, 'weekly', new FakeModelClient(fakeOk(pick(...ids))));
    expect(result.selected).toHaveLength(7);
    expect(result.selected[0]?.id).toBe(ids[0]);
  });

  it('falls back to the engine order, truncated, when the model fails', async () => {
    for (const reason of ['refusal', 'max_tokens', 'parse', 'api_error'] as const) {
      const result = await insightSelect(facts, 'weekly', new FakeModelClient(fakeFail(reason)));
      expect(result.source).toBe('fallback');
      expect(result.failure).toBe(reason);
      expect(result.selected.map((s) => s.id)).toEqual(
        facts.candidate_insights.slice(0, 7).map((c) => c.id),
      );
    }
  });

  it('falls back when nothing the model chose is a real candidate', async () => {
    const result = await insightSelect(
      facts,
      'weekly',
      new FakeModelClient(fakeOk(pick('x', 'y'))),
    );
    expect(result.source).toBe('fallback');
    expect(result.failure).toBe('empty');
    expect(result.selected).toHaveLength(7);
  });

  it('does not call the model when there are no candidates', async () => {
    const client = new FakeModelClient(fakeOk(pick('ins_sub')));
    const result = await insightSelect({ ...facts, candidate_insights: [] }, 'weekly', client);
    expect(result.selected).toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it('puts the stable prompt in system and the candidates inside <data> in the user message', async () => {
    const client = new FakeModelClient(fakeOk(pick('ins_sub')));
    await insightSelect(facts, 'monthly', client);
    const call = client.calls[0];
    expect(call?.system).toBe(INSIGHT_SELECT_V1.system);
    expect(call?.user).toContain('Maximum insights to select: 12');
    expect(call?.user).toMatch(/<data name="candidates">[\s\S]*"ins_sub"[\s\S]*<\/data>/);
    expect(call?.user).not.toContain('drilldown');
    expect(call?.step).toBe('insight-select');
  });
});
