import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BudgetGuard, costEntry, InMemoryCostLedger } from './cost.js';
import { readAiConfig } from './env.js';
import {
  AnthropicModelClient,
  describeModelError,
  FakeModelClient,
  fakeFail,
  fakeOk,
} from './model-client.js';

const Schema = z.strictObject({ answer: z.string() });
const config = readAiConfig({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-test' });
const now = new Date('2026-10-12T10:00:00Z');

interface StubParams {
  model: string;
  max_tokens: number;
  betas: string[];
  fallbacks: string;
  system: { type: string; text: string; cache_control: { type: string } }[];
  messages: { role: string; content: string }[];
  output_config: {
    effort: string;
    format: { type: string; schema: unknown; parse(text: string): unknown };
  };
  thinking?: unknown;
}

interface StubReply {
  text: string;
  stop_reason: string;
  stop_details?: { type: 'refusal'; category: string | null; explanation: string | null } | null;
  model?: string;
}

/** A stand-in for the SDK that behaves like `beta.messages.parse`: it runs the format's parse on the text. */
function stubSdk(reply: StubReply | Error): { sdk: Anthropic; calls: StubParams[] } {
  const calls: StubParams[] = [];
  const sdk = {
    beta: {
      messages: {
        parse: async (params: StubParams) => {
          calls.push(params);
          if (reply instanceof Error) throw reply;
          const parsed = params.output_config.format.parse(reply.text);
          return {
            id: 'msg_1',
            model: reply.model ?? 'claude-opus-5-5',
            stop_reason: reply.stop_reason,
            stop_details: reply.stop_details ?? null,
            usage: {
              input_tokens: 1000,
              output_tokens: 500,
              cache_read_input_tokens: 2000,
              cache_creation_input_tokens: null,
            },
            content: [{ type: 'text', text: reply.text }],
            parsed_output: parsed,
          };
        },
      },
    },
  };
  return { sdk: sdk as unknown as Anthropic, calls };
}

function clientWith(
  reply: StubReply | Error,
  overrides: { config?: typeof config; guard?: BudgetGuard } = {},
) {
  const ledger = new InMemoryCostLedger();
  const cfg = overrides.config ?? config;
  const guard = overrides.guard ?? new BudgetGuard({ config: cfg, ledger });
  const { sdk, calls } = stubSdk(reply);
  const client = new AnthropicModelClient({ config: cfg, guard, ledger, sdk, now: () => now });
  return { client, calls, ledger };
}

const request = {
  step: 'write',
  system: 'STABLE SYSTEM PROMPT',
  user: '<data>volatile</data>',
  schema: Schema,
};

describe('AnthropicModelClient', () => {
  it('sends the request shape: Opus 5.5, fallbacks, cached stable system prompt, structured output, no thinking or prefill', async () => {
    const { client, calls } = clientWith({ text: '{"answer":"ok"}', stop_reason: 'end_turn' });
    const result = await client.structured({ ...request, effort: 'low' });
    expect(result).toMatchObject({ ok: true, value: { answer: 'ok' }, model: 'claude-opus-5-5' });
    const params = calls[0];
    expect(params?.model).toBe('claude-opus-5-5');
    expect(params?.max_tokens).toBe(16_000);
    expect(params?.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params?.fallbacks).toBe('default');
    expect(params?.system).toEqual([
      { type: 'text', text: 'STABLE SYSTEM PROMPT', cache_control: { type: 'ephemeral' } },
    ]);
    expect(params?.messages).toEqual([{ role: 'user', content: '<data>volatile</data>' }]);
    expect(params?.output_config.effort).toBe('low');
    expect(params?.output_config.format.type).toBe('json_schema');
    expect(params?.thinking).toBeUndefined();
  });

  it('records usage and cost for every completed call', async () => {
    const { client, ledger } = clientWith({ text: '{"answer":"ok"}', stop_reason: 'end_turn' });
    const result = await client.structured(request);
    expect(result.ok && result.usage).toEqual({
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: 0,
    });
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      step: 'write',
      model: 'claude-opus-5-5',
      input_tokens: 1000,
      output_tokens: 500,
      cache_read: 2000,
      cache_write: 0,
      at: now.toISOString(),
    });
    expect(ledger.entries[0]?.cost_usd).toBeCloseTo((1000 * 4 + 500 * 20 + 2000 * 0.2) / 1e6, 12);
  });

  it('treats a refusal as a failure, with the category, and still records its cost', async () => {
    const { client, ledger } = clientWith({
      text: '',
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: null },
    });
    const result = await client.structured(request);
    expect(result).toMatchObject({ ok: false, reason: 'refusal', detail: 'refusal: cyber' });
    expect(ledger.entries).toHaveLength(1);
  });

  it('treats max_tokens (truncated JSON) as a failure without throwing', async () => {
    const { client } = clientWith({ text: '{"answer":"tru', stop_reason: 'max_tokens' });
    expect(await client.structured(request)).toMatchObject({ ok: false, reason: 'max_tokens' });
  });

  it('treats output that does not fit the schema as a parse failure', async () => {
    const { client } = clientWith({ text: '{"answer":42}', stop_reason: 'end_turn' });
    expect(await client.structured(request)).toMatchObject({ ok: false, reason: 'parse' });
    const { client: c2 } = clientWith({ text: 'not json', stop_reason: 'end_turn' });
    expect(await c2.structured(request)).toMatchObject({ ok: false, reason: 'parse' });
  });

  it('maps SDK errors by class to api_error without leaking messages', async () => {
    const rate = new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers());
    expect(await clientWith(rate).client.structured(request)).toEqual({
      ok: false,
      reason: 'api_error',
      detail: 'rate_limited (429)',
    });
    const conn = new Anthropic.APIConnectionError({ message: 'socket hang up' });
    expect(await clientWith(conn).client.structured(request)).toEqual({
      ok: false,
      reason: 'api_error',
      detail: 'connection_error',
    });
    expect(
      describeModelError(new Anthropic.InternalServerError(500, undefined, 'boom', new Headers())),
    ).toBe('api_error (500)');
    expect(describeModelError(new Error('x'))).toBe('unknown_error');
  });

  it('does not call the model when AI is disabled or the budget is spent', async () => {
    const disabled = clientWith(
      { text: '{}', stop_reason: 'end_turn' },
      { config: readAiConfig({}) },
    );
    expect(await disabled.client.structured(request)).toEqual({ ok: false, reason: 'disabled' });
    expect(disabled.calls).toHaveLength(0);

    const ledger = new InMemoryCostLedger();
    await ledger.record(
      costEntry(
        'write',
        'claude-opus-5-5',
        {
          input_tokens: 0,
          output_tokens: 200_000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        now,
      ),
    );
    const spent = clientWith(
      { text: '{}', stop_reason: 'end_turn' },
      { guard: new BudgetGuard({ config, ledger }) },
    );
    expect(await spent.client.structured(request)).toEqual({ ok: false, reason: 'budget' });
    expect(spent.calls).toHaveLength(0);
  });
});

describe('FakeModelClient', () => {
  it('replays scripted replies in order and records calls', async () => {
    const fake = new FakeModelClient([fakeOk({ answer: 'one' }), fakeFail('refusal')]);
    expect(await fake.structured(request)).toMatchObject({ ok: true, value: { answer: 'one' } });
    expect(await fake.structured(request)).toMatchObject({ ok: false, reason: 'refusal' });
    expect(await fake.structured(request)).toMatchObject({ ok: false, reason: 'api_error' });
    expect(fake.calls.map((c) => c.step)).toEqual(['write', 'write', 'write']);
  });

  it('validates ok replies against the request schema', async () => {
    const fake = new FakeModelClient(fakeOk({ wrong: true }));
    expect(await fake.structured(request)).toMatchObject({ ok: false, reason: 'parse' });
  });

  it('accepts a responder function', async () => {
    const fake = new FakeModelClient((req) => fakeOk({ answer: req.step }));
    expect(await fake.structured(request)).toMatchObject({ ok: true, value: { answer: 'write' } });
    expect(await fake.structured({ ...request, step: 'judge' })).toMatchObject({
      ok: true,
      value: { answer: 'judge' },
    });
  });
});
