/**
 * @file Per-asset rate limit + in-flight dedup decorator for
 * `DiagnosePort`.
 *
 * **Decorator pattern, not subclass.** CLAUDE.md rule 17 — composition
 * over inheritance. This class implements `DiagnosePort` and wraps
 * another `DiagnosePort`; it adds two cross-cutting behaviors
 * (rate-limit, dedup) without baking them into either the real or
 * stub adapter. The composition root
 * (`create-diagnose-port.ts::createDiagnosePort`) always wraps the
 * inner adapter with this decorator, so both Anthropic and stub
 * paths share the same rate-limit semantics.
 *
 * **Two behaviors, in order.**
 *
 *  1. **In-flight dedup** (keyed by `asset + contextHash`). If a
 *     request with structurally identical context is already in
 *     flight, return that pending Promise. Two simultaneous clicks
 *     on the dashboard's diagnose button — or a re-issued retry from
 *     a flaky network — get the same response without making two
 *     upstream calls. CLAUDE.md operational quirks → "Diagnose
 *     dedup" (implicit; documented here).
 *
 *  2. **Per-asset rate limit** (`windowMs`, default 10 s). After a
 *     successful dispatch, the asset is on a 10s cooldown; a new
 *     request within the window throws `DiagnoseRateLimitedError`.
 *     The controller maps this to HTTP 429 with `retryAfterMs`.
 *
 * **Why the dedup check happens before the rate-limit check.** Order
 * matters. If two simultaneous requests for the same context arrive
 * and we did the rate-limit check first, the second one would error
 * with "rate limited" even though the user logically issued a
 * single request. With dedup first, the second one joins the
 * pending Promise — no error, no extra upstream call, same response.
 *
 * **`lastStartAt` is keyed by `AssetId` alone, not by `contextHash`.**
 * The rate limit is *per asset* on purpose: a stuck source on BTC
 * should not stop an operator from running diagnose on ETH. The
 * dedup map is keyed by the full `asset + contextHash` because the
 * "same Promise" property is structural — two different contexts
 * for the same asset are different requests.
 *
 * **Default window of 10 seconds.** This matches the Anthropic
 * adapter's `DIAGNOSE_TIMEOUT_MS` — the window is "at least one
 * request's worth of latency budget" plus margin. Operator-driven
 * diagnose is not a hot path; 10s is plenty to read the response and
 * decide whether to ask again.
 *
 * **`finally` on cleanup.** The pending Promise is removed from the
 * in-flight Map regardless of success or failure. We do *not* delete
 * the rate-limit timestamp here — that is the whole point of the
 * cooldown. A failed upstream call (DiagnoseUnavailableError) still
 * "spent" the window; the operator should not be able to retry-spam
 * a broken upstream by exploiting failure.
 *
 * Cross-references:
 *  - `domain/ports/diagnose.port.ts`: the port + the two typed errors.
 *  - `diagnose-context-hash.ts`: the canonical fingerprint function
 *    used as the dedup key.
 *  - `interface/diagnose.controller.ts`: the only caller; reads
 *    `DiagnoseRateLimitedError` via `instanceof` and maps it to 429.
 */
import { DiagnoseRateLimitedError } from '../../domain/ports/diagnose.port.js';

import { hashDiagnoseContext } from './diagnose-context-hash.js';


import type {
  DiagnoseContext,
  DiagnosePort,
  DiagnoseResult,
} from '../../domain/ports/diagnose.port.js';
import type { AssetId } from '@price-oracle/contracts/primitives';

/**
 * Default per-asset cooldown. 10 s — see file header rationale.
 */
const DIAGNOSE_RATE_LIMIT_WINDOW_MS = 10_000;

export class RateLimitedDiagnose implements DiagnosePort {
  /**
   * In-flight Map keyed by `${asset}:${contextHash}`. The value is
   * the pending Promise; lookups return that Promise so concurrent
   * callers share the same resolution.
   */
  private readonly inFlight = new Map<string, Promise<DiagnoseResult>>();

  /**
   * Last-start timestamp per asset. Reset is never explicit — the
   * `now - last < windowMs` check handles expiration naturally.
   */
  private readonly lastStartAt = new Map<AssetId, number>();

  /**
   * @param inner   Adapter to wrap (`AnthropicDiagnoseAdapter` or
   *                `StubDiagnoseAdapter` — selected by
   *                `create-diagnose-port.ts`).
   * @param clock   Wall-clock provider. Tests drive a fake clock to
   *                exercise the rate-limit boundary deterministically.
   * @param windowMs Per-asset cooldown. Default 10 s; tests can pass
   *                 a shorter window.
   */
  constructor(
    private readonly inner: DiagnosePort,
    private readonly clock: () => number,
    private readonly windowMs: number = DIAGNOSE_RATE_LIMIT_WINDOW_MS,
  ) {}

  /**
   * Decorated `diagnose`. Five steps:
   *
   *  1. Build the dedup key.
   *  2. **Dedup check first** — return the in-flight Promise if any.
   *     See file header: dedup before rate-limit is intentional.
   *  3. Rate-limit check: if the asset is still within `windowMs` of
   *     the last accepted dispatch, reject with
   *     `DiagnoseRateLimitedError(retryAfterMs)`.
   *  4. Record the new dispatch timestamp, kick off the inner call.
   *  5. Register a `finally` cleanup that removes the in-flight
   *     entry (success or failure — see file header on cooldown
   *     semantics).
   */
  diagnose(context: DiagnoseContext): Promise<DiagnoseResult> {
    const key = `${context.asset}:${hashDiagnoseContext(context)}`;
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing;

    const now = this.clock();
    const last = this.lastStartAt.get(context.asset);
    if (last !== undefined && now - last < this.windowMs) {
      // `retryAfterMs` is the remaining window — surfaced to the
      // dashboard via HTTP 429 so it can render a countdown without
      // polling.
      return Promise.reject(new DiagnoseRateLimitedError(this.windowMs - (now - last)));
    }

    this.lastStartAt.set(context.asset, now);
    const pending = this.inner.diagnose(context).finally(() => {
      // Always clear the in-flight entry. We do NOT clear
      // `lastStartAt` — the window applies even to failed dispatches
      // by design (see file header).
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return pending;
  }
}
