/**
 * @file Anthropic-backed adapter for `DiagnosePort`.
 *
 * **What this is.** The "real" diagnose adapter: it calls the
 * Anthropic Messages API with a structured prompt and returns the
 * model's Markdown explanation. Used in production and in dev when
 * `ANTHROPIC_API_KEY` is set. When the key is absent, the
 * composition-time selector in `create-diagnose-port.ts` swaps this
 * adapter for `StubDiagnoseAdapter` — see `decisions.md` Entry 6 and
 * CLAUDE.md operational quirks ("Anthropic stub fallback preserves
 * end-to-end runnability without secrets").
 *
 * **Why the `AnthropicLike` interface instead of importing the SDK
 * directly.** Two reasons:
 *
 *  1. **Testability.** The unit test
 *     (`anthropic-diagnose.adapter.test.ts`) hand-rolls a fake
 *     `AnthropicLike` that records the call args and returns canned
 *     content — no SDK initialization, no network, no API key
 *     required to run the test. The narrow interface is what makes
 *     this trivial: implement two methods (`messages.create`) and
 *     you're done.
 *
 *  2. **Bounded surface area.** The Anthropic SDK exposes dozens of
 *     methods; by defining only what this adapter actually calls, a
 *     change to the SDK's wider API cannot break this code. The
 *     concrete wrapping happens in `create-diagnose-port.ts::realClient`.
 *
 * **Timeout via `AbortSignal.timeout`.** The Anthropic call is hard-
 * gated at `DIAGNOSE_TIMEOUT_MS` (10 s). A hung HTTP call would
 * otherwise pin the diagnose controller's request indefinitely and
 * pile up handler promises. `AbortSignal.timeout` is the standard
 * fetch-friendly mechanism — the SDK forwards it to the underlying
 * fetch, which throws an `AbortError` that we then convert into a
 * `DiagnoseUnavailableError`.
 *
 * **Why `claude-haiku-4-5`.** The diagnose feature is operator-
 * facing; latency is the primary cost (the dashboard waits on it),
 * and the task — explain per-source health with cited audit events
 * — is well within Haiku's capability. Sonnet would be a marginal
 * quality improvement at multiple-times the latency. Concrete model
 * choice is intentionally pinned (no env-var override) so the
 * behavior is reproducible across reviewers; bump the constant if
 * Anthropic ships a newer version.
 *
 * **Error handling.** Two failure modes, both mapped to
 * `DiagnoseUnavailableError`:
 *
 *  - SDK call threw (network, timeout, auth, rate-limit at the
 *    upstream — we don't differentiate, the controller maps all of
 *    them to HTTP 503).
 *  - SDK call returned no usable text content (an edge case where
 *    the model returned only tool-use blocks or an empty array).
 *
 * The thrown error carries the underlying SDK error on `cause` so
 * pino logs the full stack when the controller catches it. CLAUDE.md
 * rule 19: errors are typed.
 *
 * **`tokensUsed`.** The contract field is optional. We populate it
 * with `input_tokens + output_tokens` (the SDK's `usage` shape) so
 * the dashboard can render "X tokens / Y ms" beneath the response.
 * If `usage` is absent (older SDK responses), we omit the field
 * entirely rather than reporting 0.
 *
 * Cross-references:
 *  - `domain/ports/diagnose.port.ts`: the port contract and the two
 *    typed error classes.
 *  - `create-diagnose-port.ts`: the composition-time selector that
 *    decides between this adapter and the stub.
 *  - `rate-limited-diagnose.decorator.ts`: wraps every `DiagnosePort`
 *    (including this one) with per-asset rate limit + in-flight
 *    dedup.
 *  - `decisions.md` Entry 6.
 */
import { DiagnoseUnavailableError } from '../../domain/ports/diagnose.port.js';

import type {
  DiagnoseContext,
  DiagnosePort,
  DiagnoseResult,
} from '../../domain/ports/diagnose.port.js';
import type { SourceState } from '../../domain/types.js';

/**
 * Pinned model and limits. Bumping the model literal is the standard
 * upgrade path; the rest of the codebase makes no assumption about
 * which Anthropic model is in use. `DIAGNOSE_MAX_TOKENS = 1024` is
 * plenty for the Markdown-formatted explanation we expect.
 */
const DIAGNOSE_MODEL = 'claude-haiku-4-5-20251001';
const DIAGNOSE_MAX_TOKENS = 1024;
const DIAGNOSE_TIMEOUT_MS = 10_000;

/**
 * The narrow shape this adapter needs from the SDK. The real
 * Anthropic SDK satisfies this interface; the test fakes implement
 * the same two methods.
 *
 * Note: parameters mirror the SDK's wire format
 * (`max_tokens`, `input_tokens`, `output_tokens` — snake_case)
 * because that is what the real client expects. The boundary
 * translation to the contract's camelCase happens inside `diagnose()`.
 */
export interface AnthropicLike {
  messages: {
    create(
      body: {
        model: string;
        max_tokens: number;
        messages: ReadonlyArray<{ role: 'user'; content: string }>;
      },
      options?: { signal?: AbortSignal },
    ): Promise<{
      content: ReadonlyArray<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    }>;
  };
}

/**
 * Render one line per source for the prompt. Concise on purpose —
 * the model doesn't need a paragraph per source, just the health
 * label and last price so it can correlate sources to the events
 * the prompt also includes.
 */
function summarizeSources(sources: readonly SourceState[]): string {
  return sources
    .map((s) => `- ${s.source}: ${s.health}, lastPrice=${s.lastPrice ?? 'n/a'}`)
    .join('\n');
}

/**
 * Compose the prompt the model sees. Five sections in order:
 *  1. Role + asset identification.
 *  2. Current confidence + breaker state.
 *  3. Per-source bullets (from `summarizeSources`).
 *  4. Recent audit events as JSON (full structure so the model can
 *     cite transitions, anomaly drift values, etc.).
 *  5. Instruction: concise Markdown, likely causes, suggested checks.
 *
 * The prompt is plain user content (no system message) — Haiku
 * follows the instruction reliably without needing a separate
 * system prompt.
 */
function buildPrompt(context: DiagnoseContext): string {
  return [
    `You are an observability assistant for a crypto price oracle. Asset: ${context.asset}.`,
    `Current confidence: ${context.confidence}. Circuit breaker: ${context.breaker}.`,
    `Per-source state:`,
    summarizeSources(context.sources),
    `Recent audit events (${context.recentEvents.length}): ${JSON.stringify(context.recentEvents)}`,
    `Explain the current price-feed health in concise Markdown for an operator. Note likely causes and suggested checks.`,
  ].join('\n');
}

/**
 * Concatenate every text block in the response. The Anthropic API
 * returns an array of content blocks (text / tool-use / etc.); we
 * filter to text blocks with a defined `text` field and join them.
 *
 * Returns `null` if the concatenation is empty — meaning the model
 * returned no usable text. The caller converts that into a
 * `DiagnoseUnavailableError` so the controller renders HTTP 503.
 */
function extractText(content: ReadonlyArray<{ type: string; text?: string }>): string | null {
  const text = content
    .filter((c): c is { type: string; text: string } => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
  return text.length > 0 ? text : null;
}

export class AnthropicDiagnoseAdapter implements DiagnosePort {
  /**
   * @param client A `AnthropicLike` — production passes the SDK wrapper
   *               from `create-diagnose-port.ts::realClient`; tests
   *               pass a fake.
   * @param clock  Wall-clock provider for latency measurement. Tests
   *               drive a fake clock so latency assertions are exact.
   *               Same pattern as the orchestrator's `now`.
   */
  constructor(
    private readonly client: AnthropicLike,
    private readonly clock: () => number,
  ) {}

  /**
   * One diagnose round trip. The shape:
   *
   *  1. Start the clock.
   *  2. Call `messages.create` with the prompt + a 10s
   *     `AbortSignal.timeout`.
   *  3. On throw (network, timeout, auth, etc.) → wrap in
   *     `DiagnoseUnavailableError` and rethrow with the original
   *     error preserved on `cause`.
   *  4. Extract text content. If empty → `DiagnoseUnavailableError`.
   *  5. Compute latency from the clock delta.
   *  6. Return Markdown + latency + (optional) tokens.
   */
  async diagnose(context: DiagnoseContext): Promise<DiagnoseResult> {
    const start = this.clock();
    let response: Awaited<ReturnType<AnthropicLike['messages']['create']>>;
    try {
      response = await this.client.messages.create(
        {
          model: DIAGNOSE_MODEL,
          max_tokens: DIAGNOSE_MAX_TOKENS,
          messages: [{ role: 'user', content: buildPrompt(context) }],
        },
        // Hard timeout — see file header.
        { signal: AbortSignal.timeout(DIAGNOSE_TIMEOUT_MS) },
      );
    } catch (err: unknown) {
      // Includes AbortError from the timeout, network errors, auth
      // errors, etc. Controller maps all of these to HTTP 503.
      throw new DiagnoseUnavailableError('anthropic diagnose call failed', { cause: err });
    }
    const markdown = extractText(response.content);
    if (markdown === null) {
      // The SDK call succeeded but produced nothing renderable.
      // Same surface as a failed call: HTTP 503.
      throw new DiagnoseUnavailableError('anthropic diagnose returned no text content');
    }
    const latencyMs = this.clock() - start;
    const usage = response.usage;
    // Conditional spread keeps `tokensUsed` truly absent when the SDK
    // response had no usage payload — see the parallel reasoning in
    // `config/env.schema.ts` for the optional-key pattern.
    return usage === undefined
      ? { markdown, latencyMs }
      : { markdown, latencyMs, tokensUsed: usage.input_tokens + usage.output_tokens };
  }
}
