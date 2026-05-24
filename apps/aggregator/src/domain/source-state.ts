/**
 * @file Per-source health finite-state machine with hysteresis.
 *
 * **The job.** A source (Binance / Coinbase / mock) emits ticks at an
 * irregular cadence; sometimes the cadence dips, sometimes the feed
 * stops entirely, sometimes it recovers. This file maps the
 * combination of "how old is the last tick?" and "what was its last
 * classification?" into the three public health states the rest of
 * the system reasons over: HEALTHY → DEGRADED → STALE (and back).
 *
 * **Why this is in `domain/`.** Pure code, no I/O, no decorators, no
 * `Date.now()` — wall-clock time enters as the `now: Millis`
 * parameter. CLAUDE.md rule 16. That property is what lets
 * `source-state.property.test.ts` and `per-asset-isolation.property.test.ts`
 * blast `fast-check` arbitraries through the FSM and prove invariants
 * without mocks. The fast-check arbitraries themselves are in
 * `__test-helpers__/arbitraries.ts`.
 *
 * **Why hysteresis (the `pending*` fields).** A naive classifier that
 * promoted the moment `age > degradedAfterMs` would flap every time a
 * tick landed near the threshold. The system would emit a stream of
 * SourceStateChanged audit events and the dashboard's source-health
 * widget would strobe. The fix is the classic FSM hysteresis pattern:
 * track the *candidate* next health, count consecutive observations
 * agreeing with it, and only commit the transition once the streak
 * reaches `healthHysteresisStreak`. The result is that brief jitter
 * around a boundary is absorbed; only sustained changes propagate.
 *
 * **How this composes upward.** The orchestrator
 * (`application/orchestrator.ts`) calls `updateSourceState` twice per
 * source per tick cycle: once on a real `Tick` (via `routeTick`,
 * driven by the NATS subscriber) and once with `tick = null` on every
 * pulse (via `applySourceUpdate(... null ...)`). The null call ages a
 * source forward in time even if no tick arrived this pulse — that is
 * what drives HEALTHY → DEGRADED → STALE when an upstream source goes
 * silent. The `perSourceHealthScore` function then feeds the
 * weighted-median aggregation in `aggregate.ts`.
 *
 * Cross-references:
 *  - `@price-oracle/contracts/aggregation/freshness.ts`: the
 *    `computeFreshness` formula used by `perSourceHealthScore`.
 *  - `decisions.md` Entry 3 (hexagonal hybrid) — why the aggregator
 *    has a domain layer at all, while the ingestors do not.
 *  - CLAUDE.md operational quirks: "Asset is a first-class dimension"
 *    — note that this file is asset-agnostic. Per-asset isolation is
 *    achieved by the orchestrator holding a separate `Map<SourceId,
 *    SourceState>` per asset, not by branching here.
 */
import { computeFreshness } from '@price-oracle/contracts/aggregation';

import type { SourceState, Thresholds, Tick } from './types.js';
import type { Millis, SourceHealth } from '@price-oracle/contracts/primitives';


/**
 * Classify a source's health from the age of its last tick.
 *
 * The three-tier classification is the only place where the
 * "DEGRADED" band is computed — the FSM above this function decides
 * whether to *commit* the candidate, but the threshold math lives
 * here. A source whose `lastTickAt` is `null` (never ticked) is
 * STALE by definition: there is no observation we can trust.
 *
 * @returns The candidate health for this observation. The caller
 *          (`updateSourceState`) decides whether to promote to it
 *          immediately or hold it in `pendingHealth` until the
 *          hysteresis streak completes.
 */
function classifyHealth(lastTickAt: Millis | null, now: Millis, cfg: Thresholds): SourceHealth {
  if (lastTickAt === null) return 'STALE';
  const age = now - lastTickAt;
  // Order matters: the inclusive `<=` boundary is owned by the more
  // optimistic class. A tick exactly at `degradedAfterMs` reads
  // HEALTHY; exactly at `staleAfterMs` reads DEGRADED. The
  // `orchestrator.config.ts` `.refine` checks pin the relationship
  // `degradedAfterMs <= staleAfterMs <= freshnessDecayMs` so these
  // bands are non-empty and the freshness factor stays positive while
  // a source is still DEGRADED.
  if (age <= cfg.degradedAfterMs) return 'HEALTHY';
  if (age <= cfg.staleAfterMs) return 'DEGRADED';
  return 'STALE';
}

/**
 * Drive the FSM one step forward.
 *
 * Two call sites in the orchestrator:
 *  1. **Tick-driven** (`tick !== null`): a real `Tick` arrived from
 *     the NATS subscriber. We refresh `lastTickAt` / `lastPrice`
 *     (subject to a monotonicity guard — see below), then reclassify.
 *  2. **Pulse-driven** (`tick === null`): the 500ms aggregation timer
 *     fired. We do not change `lastTickAt`, but `now` has advanced;
 *     a source that has gone quiet will see its `age` cross the
 *     thresholds and degrade. This is how silence is observed in a
 *     pull-fashioned way.
 *
 * Output rules:
 *  - **Candidate equals current health** → clear any pending
 *    transition (`pendingHealth = null`, `pendingStreak = 0`). A
 *    single agreeing observation resets hysteresis.
 *  - **Candidate differs and matches the existing pending** →
 *    increment the streak.
 *  - **Candidate differs and replaces the pending** → start a fresh
 *    streak at 1.
 *  - **Streak crosses `healthHysteresisStreak`** → commit:
 *    `health = candidate`, clear pending.
 *
 * Monotonicity guard: `tick.receivedAt >= prev.lastTickAt`. NATS Core
 * is best-effort ordered, but with multiple subscribers / reconnects
 * we tolerate an out-of-order tick by *ignoring* it for the lastTickAt
 * field. We do still re-classify (the call still produces a fresh
 * state), but we never let `lastTickAt` go backwards — that would
 * mean an older price could appear "fresh" on a later pulse.
 *
 * @returns A brand-new `SourceState`. CLAUDE.md rule 16 + the
 *          `Readonly<>` wrapper on the type both make immutability
 *          structural.
 */
export function updateSourceState(
  prev: SourceState,
  tick: Tick | null,
  now: Millis,
  cfg: Thresholds,
): SourceState {
  let lastTickAt = prev.lastTickAt;
  let lastPrice = prev.lastPrice;
  if (tick && (prev.lastTickAt === null || tick.receivedAt >= prev.lastTickAt)) {
    // Monotonicity guard: only adopt the tick if it is at-or-after
    // the previously observed tick. See file header for the rationale.
    lastTickAt = tick.receivedAt;
    lastPrice = tick.price;
  }
  const candidate = classifyHealth(lastTickAt, now, cfg);

  // Steady-state: candidate agrees with the committed health. Any
  // in-progress hysteresis bookkeeping is no longer relevant — clear
  // it so a future disagreement starts from a clean streak of 1.
  if (candidate === prev.health) {
    return { ...prev, lastTickAt, lastPrice, pendingHealth: null, pendingStreak: 0 };
  }

  // Candidate disagrees. Either continue an existing pending streak
  // (same candidate as before) or start a new one.
  const pendingStreak = prev.pendingHealth === candidate ? prev.pendingStreak + 1 : 1;

  if (pendingStreak >= cfg.healthHysteresisStreak) {
    // Streak satisfied — commit the candidate. Clear pending so the
    // FSM is ready to start observing the next potential change.
    return {
      ...prev,
      lastTickAt,
      lastPrice,
      health: candidate,
      pendingHealth: null,
      pendingStreak: 0,
    };
  }

  // Still gathering evidence: hold the candidate in `pendingHealth`,
  // do not change the committed `health` yet.
  return { ...prev, lastTickAt, lastPrice, pendingHealth: candidate, pendingStreak };
}

/**
 * The per-source weight that the weighted-median aggregator consumes.
 *
 * Two short-circuits and one formula:
 *
 *  1. STALE sources contribute **zero** — they are excluded from the
 *     median entirely. This is the contract the aggregator relies on:
 *     a STALE source's last price could be arbitrarily old, and we
 *     refuse to let it pull the median.
 *  2. A source that has never ticked (`lastTickAt === null`) also
 *     contributes zero, even if its FSM-committed health is somehow
 *     not STALE (defensive — should be unreachable, since the FSM
 *     starts in STALE and `classifyHealth(null, ...)` returns STALE).
 *  3. HEALTHY and DEGRADED both go through `computeFreshness`, which
 *     decays linearly from 1.0 at `age=0` to 0.0 at `age =
 *     freshnessDecayMs`. The hysteresis lower-bound (`staleAfterMs <=
 *     freshnessDecayMs`) is what guarantees a DEGRADED source still
 *     has a positive weight.
 *
 * The freshness formula itself lives in
 * `@price-oracle/contracts/aggregation/freshness.ts` and is shared with
 * the per-aggregate confidence calculation in `aggregate.ts`.
 */
export function perSourceHealthScore(state: SourceState, now: Millis, cfg: Thresholds): number {
  if (state.health === 'STALE' || state.lastTickAt === null) return 0;
  return computeFreshness(now, state.lastTickAt, cfg.freshnessDecayMs);
}
