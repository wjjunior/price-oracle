/**
 * @file Composition-time selector for `DiagnosePort`.
 *
 * **The single most important file in the diagnose stack.** This is
 * where the API-key conditional lives — and nowhere else. CLAUDE.md
 * operational quirks: "Anthropic stub fallback preserves end-to-end
 * runnability without secrets." `decisions.md` Entry 6 records the
 * full rationale, but the short version is:
 *
 *   The orchestrator's code path is identical whether we have an
 *   API key or not. If we put the `if (apiKey) { ... }` inside the
 *   diagnose use case (or, worse, inside the orchestrator), we
 *   would leak deployment knowledge into a layer that doesn't care,
 *   and we would create a "no-key" branch that no demo would ever
 *   exercise. Adapter selection at the composition root preserves
 *   the "stub is a real adapter" invariant.
 *
 * **What this function returns.** A `DiagnosePort`, wrapped in the
 * rate-limit + dedup decorator. The decorator wraps **both** the
 * real adapter and the stub on purpose — we want the same
 * rate-limit semantics in dev (where a reviewer might mash the
 * diagnose button) as in production.
 *
 * **`realClient` is the only place in the codebase that touches the
 * Anthropic SDK directly** (CLAUDE.md rule 14: "Adapters for external
 * integrations"). It implements the `AnthropicLike` interface
 * defined in `anthropic-diagnose.adapter.ts`, mapping the real SDK's
 * shape to the narrow contract this adapter actually needs. The
 * unit test for the adapter passes a fake `AnthropicLike` directly
 * — no SDK, no network.
 *
 * **The `stream: false` flag in `realClient`** is defensive: the SDK
 * supports streaming responses (which return an async iterator
 * instead of a single result), and forcing `stream: false` keeps
 * the response shape statically typed as the non-streaming variant.
 *
 * **`clock` defaults to `Date.now`** rather than reading from a
 * config token. Both adapters take `clock` as a constructor
 * argument so unit tests can drive a fake clock without touching
 * globals (CLAUDE.md rule 16 spirit: parameterize time). The
 * production caller (`app.module.ts`) does not override it.
 *
 * Cross-references:
 *  - `anthropic-diagnose.adapter.ts`: the real adapter and the
 *    `AnthropicLike` interface this file's `realClient` implements.
 *  - `stub-diagnose.adapter.ts`: the deterministic stub.
 *  - `rate-limited-diagnose.decorator.ts`: wraps either adapter.
 *  - `decisions.md` Entry 6 (composition-time diagnose adapter).
 *  - `interface/app.module.ts::DIAGNOSE_PORT` provider — the only
 *    caller in production.
 */
import Anthropic from '@anthropic-ai/sdk';

import { AnthropicDiagnoseAdapter } from './anthropic-diagnose.adapter.js';
import { RateLimitedDiagnose } from './rate-limited-diagnose.decorator.js';
import { StubDiagnoseAdapter } from './stub-diagnose.adapter.js';

import type { AnthropicLike } from './anthropic-diagnose.adapter.js';
import type { DiagnosePort } from '../../domain/ports/diagnose.port.js';

/**
 * Selector inputs. All three are optional:
 *  - `apiKey`: if set, select the real adapter; otherwise, stub.
 *  - `clock`:  test injection point; defaults to `Date.now`.
 *  - `client`: test injection point — pass a fake `AnthropicLike`
 *              to exercise the real adapter without spinning up the
 *              SDK. Production wiring passes `undefined` here.
 */
export type CreateDiagnosePortDeps = {
  apiKey?: string;
  clock?: () => number;
  client?: AnthropicLike;
};

/**
 * Adapt the real Anthropic SDK to the narrow `AnthropicLike`
 * interface. This is the only place in the codebase that knows the
 * SDK exists.
 *
 * `stream: false` is the explicit non-streaming branch — keeps the
 * return type statically typed (the streaming branch returns an
 * async iterator, which would force us to handle both shapes here).
 *
 * `messages: [...body.messages]` copies into a fresh mutable array
 * — the SDK's typings require `Array<...>`, not `ReadonlyArray<...>`,
 * so we spread once at the boundary.
 */
function realClient(apiKey: string): AnthropicLike {
  const sdk = new Anthropic({ apiKey });
  return {
    messages: {
      create: async (body, options) => {
        const m = await sdk.messages.create(
          { ...body, stream: false, messages: [...body.messages] },
          options,
        );
        return { content: m.content, usage: m.usage };
      },
    },
  };
}

/**
 * Build a fully-wired `DiagnosePort`. The DI factory in
 * `app.module.ts` calls this once at startup with `{ apiKey:
 * cfg.anthropicApiKey }` when the key is present, or `{}` when it is
 * not.
 *
 * The return value is wrapped in `RateLimitedDiagnose` so the
 * rate-limit + dedup semantics apply uniformly to whichever inner
 * adapter was selected.
 */
export function createDiagnosePort(deps: CreateDiagnosePortDeps = {}): DiagnosePort {
  const clock = deps.clock ?? Date.now;
  let inner: DiagnosePort;
  // The whole point of this file lives in this conditional.
  // Truthy `apiKey` → real adapter; otherwise stub. The orchestrator
  // never sees this decision.
  if (deps.apiKey) {
    inner = new AnthropicDiagnoseAdapter(deps.client ?? realClient(deps.apiKey), clock);
  } else {
    inner = new StubDiagnoseAdapter(clock);
  }
  return new RateLimitedDiagnose(inner, clock);
}
