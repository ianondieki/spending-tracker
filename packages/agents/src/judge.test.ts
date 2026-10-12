import { describe, expect, it } from 'vitest';

import { writeFallback } from './fallback-writer.js';
import { judgeReport } from './judge.js';
import { FakeModelClient, fakeFail, fakeOk, type ModelClient } from './model-client.js';
import { sampleFacts } from './test-fixtures.js';

const facts = sampleFacts('weekly');
const doc = writeFallback(facts, { report_id: 'w', kind: 'weekly', locale: 'en', now: new Date('2026-10-11T16:30:00Z') });
const verdict = { clarity: 4, usefulness: 3, tone: 5, language: 4, pass: true, notes: 'none' };

describe('judgeReport', () => {
  it('returns the verdict and sends the report without meta inside <data>', async () => {
    const client = new FakeModelClient(fakeOk(verdict));
    const result = await judgeReport(doc, facts, client);
    expect(result).toMatchObject({ ok: true, verdict });
    expect(client.calls[0]?.user).toContain('<data name="report">');
    expect(client.calls[0]?.user).not.toContain('"meta"');
    expect(client.calls[0]?.effort).toBe('low');
  });

  it('rejects scores outside 1 to 5 and never throws', async () => {
    expect(await judgeReport(doc, facts, new FakeModelClient(fakeOk({ ...verdict, tone: 7 })))).toMatchObject({ ok: false, reason: 'parse' });
    expect(await judgeReport(doc, facts, new FakeModelClient(fakeFail('budget')))).toEqual({ ok: false, reason: 'budget' });
    const throwing: ModelClient = { structured: () => Promise.reject(new Error('boom')) };
    expect(await judgeReport(doc, facts, throwing)).toEqual({ ok: false, reason: 'api_error' });
  });
});
