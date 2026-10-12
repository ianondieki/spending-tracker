/**
 * The one door to a model. Callers ask for structured output validated by a Zod schema and get a typed result
 * or a typed failure; they never see SDK objects, and a failure always means "use the deterministic path".
 *
 * `AnthropicModelClient` is the real implementation (Claude Opus 5.5, structured outputs, server-side refusal
 * fallbacks, prompt caching on the stable system prompt). `FakeModelClient` is the test double; CI never
 * reaches a real model.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { type z } from 'zod';

import { type BudgetGuard, type CostLedger, costEntry, type Usage, ZERO_USAGE } from './cost.js';
import { type AiConfig } from './env.js';

export type Effort = 'low' | 'medium' | 'high';

export interface StructuredRequest<T> {
  /** Workflow step name, recorded with the cost (e.g. `insight-select`, `write`). */
  readonly step: string;
  /** Stable system prompt; cached. Must not contain per-request data. */
  readonly system: string;
  /** Volatile content (facts, dates, untrusted data inside `<data>` tags). */
  readonly user: string;
  readonly schema: z.ZodType<T>;
  readonly maxTokens?: number;
  readonly effort?: Effort;
}

export type FailureReason =
  'refusal' | 'max_tokens' | 'parse' | 'api_error' | 'budget' | 'disabled';

export type StructuredResult<T> =
  | { readonly ok: true; readonly value: T; readonly usage: Usage; readonly model: string }
  | {
      readonly ok: false;
      readonly reason: FailureReason;
      readonly detail?: string;
      readonly usage?: Usage;
      readonly model?: string;
    };

export interface ModelClient {
  structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  /** True when the client records each call in a cost ledger itself (callers must not record it again). */
  readonly recordsCost?: boolean;
}

export const DEFAULT_MAX_TOKENS = 16_000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Maps any thrown value to a short, PII-free description, most specific SDK class first. */
export function describeModelError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return 'rate_limited (429)';
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof Anthropic.APIConnectionError) return 'connection_error';
  if (error instanceof Anthropic.AuthenticationError) return 'authentication_error (401)';
  if (error instanceof Anthropic.BadRequestError) return 'bad_request (400)';
  if (error instanceof Anthropic.APIError)
    return `api_error (${String(error.status ?? 'no status')})`;
  if (error instanceof Anthropic.AnthropicError) return 'sdk_error';
  return 'unknown_error';
}

function usageOf(u: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
}): Usage {
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
  };
}

export interface AnthropicModelClientOptions {
  readonly config: AiConfig;
  readonly guard: BudgetGuard;
  readonly ledger: CostLedger;
  /** Injected SDK client (tests); built from `config.apiKey` on first use otherwise. */
  readonly sdk?: Anthropic;
  readonly now?: () => Date;
}

export class AnthropicModelClient implements ModelClient {
  readonly recordsCost = true;
  private readonly config: AiConfig;
  private readonly guard: BudgetGuard;
  private readonly ledger: CostLedger;
  private readonly now: () => Date;
  private sdk: Anthropic | undefined;

  constructor(opts: AnthropicModelClientOptions) {
    this.config = opts.config;
    this.guard = opts.guard;
    this.ledger = opts.ledger;
    this.sdk = opts.sdk;
    this.now = opts.now ?? (() => new Date());
  }

  private client(apiKey: string): Anthropic {
    this.sdk ??= new Anthropic({ apiKey, maxRetries: 2 });
    return this.sdk;
  }

  async structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const apiKey = this.config.apiKey;
    if (!this.config.enabled || apiKey === null) return { ok: false, reason: 'disabled' };
    if (!(await this.guard.canSpend(this.now()))) return { ok: false, reason: 'budget' };

    // The SDK runs the format's parse() inside .parse() and throws on unparseable text, which would happen
    // before stop_reason can be checked (and lose the usage of a truncated or refused call). Wrapping it so a
    // parse problem yields null keeps the order: record usage, check stop_reason, then read parsed_output.
    const base = zodOutputFormat(req.schema);
    let parseProblem: string | undefined;
    const format = {
      ...base,
      parse: (content: string): T | null => {
        try {
          return base.parse(content);
        } catch (error) {
          parseProblem =
            error instanceof Error ? error.message.slice(0, 300) : 'unparseable output';
          return null;
        }
      },
    };

    let response;
    try {
      response = await this.client(apiKey).beta.messages.parse({
        model: this.config.model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.user }],
        output_config: { format, effort: req.effort ?? 'medium' },
      });
    } catch (error) {
      return { ok: false, reason: 'api_error', detail: describeModelError(error) };
    }

    const usage = usageOf(response.usage);
    const model = response.model;
    await this.ledger.record(costEntry(req.step, model, usage, this.now()));

    switch (response.stop_reason) {
      case 'end_turn':
        break;
      case 'refusal': {
        const details = response.stop_details;
        const category = details?.category ?? 'uncategorised';
        return { ok: false, reason: 'refusal', detail: `refusal: ${category}`, usage, model };
      }
      case 'max_tokens':
      case 'model_context_window_exceeded':
        return { ok: false, reason: 'max_tokens', detail: response.stop_reason, usage, model };
      default:
        return {
          ok: false,
          reason: 'api_error',
          detail: `unexpected stop_reason: ${String(response.stop_reason)}`,
          usage,
          model,
        };
    }

    const value = response.parsed_output;
    if (value === null || value === undefined) {
      return {
        ok: false,
        reason: 'parse',
        detail: parseProblem ?? 'no structured output',
        usage,
        model,
      };
    }
    return { ok: true, value, usage, model };
  }
}

/** A scripted reply: a fixed result, or a function of the request. */
export type FakeReply =
  | StructuredResult<unknown>
  | ((
      req: StructuredRequest<unknown>,
      callIndex: number,
    ) => StructuredResult<unknown> | Promise<StructuredResult<unknown>>);

export interface FakeCall {
  readonly step: string;
  readonly system: string;
  readonly user: string;
  readonly effort: Effort | undefined;
  readonly maxTokens: number | undefined;
}

/**
 * Test double. Replies are consumed in order (the last one repeats when `repeatLast` is set, otherwise running
 * out is an `api_error`). An `ok` reply is validated against the request schema, so a reply that does not fit
 * becomes a `parse` failure exactly as the real client would report it.
 */
export class FakeModelClient implements ModelClient {
  readonly calls: FakeCall[] = [];
  readonly recordsCost = false;
  private readonly replies: FakeReply[];
  private readonly repeatLast: boolean;

  constructor(replies: FakeReply[] | FakeReply, opts: { repeatLast?: boolean } = {}) {
    this.replies = Array.isArray(replies) ? [...replies] : [replies];
    this.repeatLast = opts.repeatLast ?? !Array.isArray(replies);
  }

  async structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const index = this.calls.length;
    this.calls.push({
      step: req.step,
      system: req.system,
      user: req.user,
      effort: req.effort,
      maxTokens: req.maxTokens,
    });
    const reply = this.replies[index] ?? (this.repeatLast ? this.replies.at(-1) : undefined);
    if (reply === undefined)
      return { ok: false, reason: 'api_error', detail: 'fake: no scripted reply' };
    const result =
      typeof reply === 'function' ? await reply(req as StructuredRequest<unknown>, index) : reply;
    if (!result.ok) return result;
    const parsed = req.schema.safeParse(result.value);
    if (!parsed.success) {
      return {
        ok: false,
        reason: 'parse',
        detail: parsed.error.message.slice(0, 300),
        usage: result.usage,
        model: result.model,
      };
    }
    return { ok: true, value: parsed.data, usage: result.usage, model: result.model };
  }
}

export function fakeOk<T>(
  value: T,
  usage: Usage = ZERO_USAGE,
  model = 'claude-opus-5-5',
): StructuredResult<T> {
  return { ok: true, value, usage, model };
}

export function fakeFail(reason: FailureReason, usage?: Usage): StructuredResult<never> {
  return usage === undefined
    ? { ok: false, reason }
    : { ok: false, reason, usage, model: 'claude-opus-5-5' };
}
