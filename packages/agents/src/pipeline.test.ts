import { describe, expect, it } from 'vitest';

import { ReportDocumentSchema } from './contracts/report-document.js';
import { BudgetGuard, costEntry, InMemoryCostLedger, type Usage } from './cost.js';
import { readAiConfig } from './env.js';
import { writeFallback } from './fallback-writer.js';
import { FakeModelClient, fakeFail, type FakeReply, fakeOk } from './model-client.js';
import { produceReport } from './pipeline.js';
import { draftFromDocument, sampleFacts } from './test-fixtures.js';
import { type ReportDraft } from './write.js';

const facts = sampleFacts('weekly');
const now = new Date('2026-10-11T16:30:00Z');
const ctx = { report_id: 'rpt_w41', kind: 'weekly' as const };
const enabled = readAiConfig({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-test' });

const SELECT_USAGE: Usage = {
  input_tokens: 1000,
  output_tokens: 200,
  cache_read_input_tokens: 500,
  cache_creation_input_tokens: 0,
};
const WRITE_USAGE: Usage = {
  input_tokens: 3000,
  output_tokens: 2000,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 1200,
};

const SELECTED = ['ins_sub', 'ins_fees', 'ins_spend', 'ins_new'];
const selection = fakeOk(
  { selected: SELECTED.map((id) => ({ id, rationale: 'useful' })) },
  SELECT_USAGE,
);

/** A draft that passes every check: the numbers-only document for the selected ids, minus meta. */
function goodDraft(): ReportDraft {
  const doc = writeFallback(facts, { ...ctx, locale: 'en', now, insightIds: SELECTED });
  const draft = draftFromDocument(doc);
  return {
    ...draft,
    title: 'Your week, in money',
    email: { ...draft.email, subject: 'Your week with Hesabu' },
  };
}

/** The good draft with one invented figure in the hero verdict. */
function badDraft(): ReportDraft {
  const draft = goodDraft();
  return {
    ...draft,
    sections: draft.sections.map((s) =>
      s.type === 'hero' ? { ...s, verdict: 'You spent KSh 99,999 more than last week.' } : s,
    ),
  };
}

function setup(
  replies: FakeReply[],
  opts: { config?: typeof enabled; ledger?: InMemoryCostLedger } = {},
) {
  const ledger = opts.ledger ?? new InMemoryCostLedger();
  const guard = new BudgetGuard({ config: opts.config ?? enabled, ledger });
  const client = new FakeModelClient(replies);
  return { client, guard, ledger, deps: { client, guard, ledger, locale: 'en' as const, now } };
}

describe('produceReport', () => {
  it('uses the numbers-only fallback without any model call when AI is disabled', async () => {
    const { client, deps } = setup([selection], { config: readAiConfig({}) });
    const result = await produceReport(facts, ctx, deps);
    expect(result.writer).toBe('fallback');
    expect(result.fallback_reason).toBe('budget');
    expect(client.calls).toHaveLength(0);
    expect(result.document.meta).toMatchObject({
      writer: 'fallback',
      model: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
    });
    expect(ReportDocumentSchema.safeParse(result.document).success).toBe(true);
  });

  it("uses the fallback without any model call when today's budget is spent", async () => {
    const ledger = new InMemoryCostLedger();
    await ledger.record(
      costEntry(
        'write',
        'claude-opus-5-5',
        {
          input_tokens: 0,
          output_tokens: 100_000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        now,
      ),
    );
    const { client, deps } = setup([selection], { ledger });
    const result = await produceReport(facts, ctx, deps);
    expect(result.writer).toBe('fallback');
    expect(client.calls).toHaveLength(0);
  });

  it('uses the fallback when the kill switch is on', async () => {
    const { client, guard, deps } = setup([selection]);
    guard.killSwitch = true;
    expect((await produceReport(facts, ctx, deps)).writer).toBe('fallback');
    expect(client.calls).toHaveLength(0);
  });

  it('accepts a good draft: model writer, one attempt, tokens and cost summed, drill-downs filled', async () => {
    const { client, ledger, deps } = setup([selection, fakeOk(goodDraft(), WRITE_USAGE)]);
    const result = await produceReport(facts, ctx, deps);
    expect(result.writer).toBe('model');
    expect(result.fallback_reason).toBeNull();
    expect(client.calls.map((c) => c.step)).toEqual(['insight-select', 'write']);
    const { document } = result;
    expect(ReportDocumentSchema.safeParse(document).success).toBe(true);
    expect(document.title).toBe('Your week, in money');
    expect(document.report_id).toBe('rpt_w41');
    expect(document.meta).toMatchObject({
      writer: 'model',
      model: 'claude-opus-5-5',
      input_tokens: 1000 + 500 + 3000 + 1200,
      output_tokens: 2200,
      fact_check: { passed: true, violations: [], attempts: 1 },
    });
    const expectedCost = (1000 * 4 + 200 * 20 + 500 * 0.2 + 3000 * 4 + 2000 * 20 + 1200 * 5) / 1e6;
    expect(document.meta.cost_usd).toBeCloseTo(expectedCost, 6);
    expect(result.cost_usd).toBeCloseTo(expectedCost, 6);
    expect(ledger.entries.map((e) => e.step)).toEqual(['insight-select', 'write']);
    const insights = document.sections.find((s) => s.type === 'insights');
    if (insights?.type !== 'insights') throw new Error('no insights');
    expect(insights.items.map((i) => i.insight_id)).toEqual(SELECTED);
    expect(insights.items[0]?.drilldown).toEqual(
      facts.candidate_insights.find((c) => c.id === 'ins_sub')?.drilldown,
    );
  });

  it('regenerates once with the violations attached, and accepts the fixed draft', async () => {
    const { client, deps } = setup([
      selection,
      fakeOk(badDraft(), WRITE_USAGE),
      fakeOk(goodDraft(), WRITE_USAGE),
    ]);
    const result = await produceReport(facts, ctx, deps);
    expect(result.writer).toBe('model');
    expect(result.attempts).toEqual([
      { violations: ['sections[0].hero.verdict: KSh 99,999'] },
      { violations: [] },
    ]);
    expect(result.document.meta.fact_check.attempts).toBe(2);
    expect(client.calls).toHaveLength(3);
    expect(client.calls[1]?.user).not.toContain('problems');
    expect(client.calls[2]?.user).toContain('<data name="problems">');
    expect(client.calls[2]?.user).toContain('sections[0].hero.verdict: KSh 99,999');
  });

  it('falls back after the second failed fact-check, recording the spend', async () => {
    const { client, deps } = setup([
      selection,
      fakeOk(badDraft(), WRITE_USAGE),
      fakeOk(badDraft(), WRITE_USAGE),
    ]);
    const result = await produceReport(facts, ctx, deps);
    expect(result.writer).toBe('fallback');
    expect(result.fallback_reason).toBe('fact_check_failed');
    expect(client.calls).toHaveLength(3);
    expect(result.document.meta).toMatchObject({
      writer: 'fallback',
      model: null,
      fact_check: { passed: true, attempts: 2 },
    });
    expect(result.document.meta.output_tokens).toBe(200 + 2000 + 2000);
    expect(result.document.meta.cost_usd).toBeGreaterThan(0);
    // The fallback follows the model's selection when it had one.
    const insights = result.document.sections.find((s) => s.type === 'insights');
    if (insights?.type !== 'insights') throw new Error('no insights');
    expect(insights.items.map((i) => i.insight_id)).toEqual(SELECTED);
  });

  for (const reason of ['refusal', 'max_tokens', 'parse', 'api_error'] as const) {
    it(`falls back when the write step fails with ${reason}`, async () => {
      const { deps } = setup([selection, fakeFail(reason, WRITE_USAGE)]);
      const result = await produceReport(facts, ctx, deps);
      expect(result.writer).toBe('fallback');
      expect(result.fallback_reason).toBe('write_failed');
      expect(result.attempts).toEqual([{ violations: [], failure: reason }]);
      expect(ReportDocumentSchema.safeParse(result.document).success).toBe(true);
    });
  }

  it('falls back when the model output does not fit the draft schema', async () => {
    const { deps } = setup([selection, fakeOk({ title: 'x', sections: [] }, WRITE_USAGE)]);
    const result = await produceReport(facts, ctx, deps);
    expect(result.writer).toBe('fallback');
    expect(result.attempts[0]?.failure).toBe('parse');
  });

  it('treats an insight id outside the selection as a problem to fix', async () => {
    const draft = goodDraft();
    const rogue: ReportDraft = {
      ...draft,
      sections: draft.sections.map((s) =>
        s.type === 'insights'
          ? {
              ...s,
              items: [
                ...s.items,
                {
                  insight_id: 'ins_unknown',
                  headline: 'Messages we could not read yet: 3',
                  body: 'They are not in these totals.',
                },
              ],
            }
          : s,
      ),
    };
    const { deps } = setup([selection, fakeOk(rogue, WRITE_USAGE), fakeOk(rogue, WRITE_USAGE)]);
    const result = await produceReport(facts, ctx, deps);
    expect(result.writer).toBe('fallback');
    expect(result.attempts[0]?.violations).toContain(
      'sections[8].insights.items[4]: insight_id is not one of the selected ids',
    );
  });

  it('carries on with the engine order when selection fails, and stops when the budget runs out mid-way', async () => {
    const engineIds = facts.candidate_insights.slice(0, 7).map((c) => c.id);
    const engineDraft = draftFromDocument(writeFallback(facts, { ...ctx, locale: 'en', now }));
    const ok = setup([fakeFail('refusal'), fakeOk(engineDraft, WRITE_USAGE)]);
    const result = await produceReport(facts, ctx, ok.deps);
    expect(result.writer).toBe('model');
    expect(result.selection?.source).toBe('fallback');
    expect(result.selection?.selected.map((s) => s.id)).toEqual(engineIds);

    const expensive: Usage = {
      input_tokens: 0,
      output_tokens: 200_000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };
    const broke = setup([
      fakeOk({ selected: [{ id: 'ins_sub', rationale: 'r' }] }, expensive),
      fakeOk(engineDraft, WRITE_USAGE),
    ]);
    const stopped = await produceReport(facts, ctx, broke.deps);
    expect(stopped.writer).toBe('fallback');
    expect(stopped.fallback_reason).toBe('budget');
    expect(broke.client.calls).toHaveLength(1);
  });

  it('records the judge verdict when asked, without changing the outcome', async () => {
    const verdict = { clarity: 4, usefulness: 4, tone: 5, language: 4, pass: true, notes: 'none' };
    const { deps } = setup([
      selection,
      fakeOk(goodDraft(), WRITE_USAGE),
      fakeOk(verdict, SELECT_USAGE),
    ]);
    const result = await produceReport(facts, ctx, { ...deps, runJudge: true });
    expect(result.writer).toBe('model');
    expect(result.judge).toMatchObject({ ok: true, verdict });
    expect(result.document.meta.output_tokens).toBe(200 + 2000 + 200);

    const failing = setup([selection, fakeOk(goodDraft(), WRITE_USAGE), fakeFail('refusal')]);
    const r2 = await produceReport(facts, ctx, { ...failing.deps, runJudge: true });
    expect(r2.writer).toBe('model');
    expect(r2.judge).toMatchObject({ ok: false, reason: 'refusal' });
  });
});
