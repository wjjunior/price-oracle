/**
 * @file Per-asset circuit breaker FSM.
 *
 * **The job.** Each asset (BTC / ETH) has an independent breaker that
 * answers a single question every aggregation pulse: "should
 * downstream consumers treat the published aggregate as actionable?"
 * The breaker has three states (also defined in
 * `@price-oracle/contracts/primitives` as the `BreakerState` enum):
 *
 *  - **CLOSED**:    normal operation. The aggregator keeps publishing
 *                   and the dashboard renders the live price.
 *  - **OPEN**:      confidence has been below the floor for the trip
 *                   streak. The orchestrator stops publishing the
 *                   aggregate on this asset while OPEN (see
 *                   `orchestrator.ts::pulseAsset`, the guard
 *                   `runtime.breaker.state !== BREAKER.OPEN`).
 *  - **HALF_OPEN**: after `recoveryWindowMs` has elapsed since the
 *                   trip, we accept "probes". If a streak of probes
 *                   stays at-or-above the floor, we close. If any
 *                   probe falls below the floor, we re-open.
 *
 * **Why a separate FSM, not just "low confidence = suppress".** A
 * single noisy tick can dip confidence below the floor; without a
 * streak requirement, the breaker would flap on every transient
 * disagreement. The trip and half-open streaks are deliberately
 * different — closing requires more evidence than tripping, which is
 * the asymmetric trust pattern of any production circuit breaker.
 *
 * **Streak bookkeeping lives in the orchestrator.** This file is a
 * **pure transition function** — `BreakerInput.streak` is provided by
 * the caller, who counts it across pulses. The split lets the FSM
 * itself stay synchronous, parameter-only, and trivially property-
 * testable, while the streak state lives next to the rest of the
 * orchestrator's per-asset runtime. See `orchestrator.ts::advanceBreaker`
 * for the streak update logic.
 *
 * **Property tests.** `breaker.property.test.ts` blasts `fast-check`
 * arbitraries (`arbBreakerConfig`, `arbBreakerState`,
 * `arbConfidence`) through `transitionBreaker` and proves:
 *
 *  - **No flapping**: CLOSED never transitions to OPEN in a single
 *    step while `streak < tripStreak`, regardless of confidence.
 *  - **Recovery requires elapsed time**: OPEN → HALF_OPEN requires
 *    `now - openedAt >= recoveryWindowMs`; OPEN → CLOSED in one step
 *    is impossible.
 *  - **Recovery requires a streak**: HALF_OPEN → CLOSED requires
 *    `streak >= halfOpenProbeStreak`; a single good probe does not
 *    close.
 *  - **Any below-floor probe re-opens HALF_OPEN immediately** — the
 *    half-open state is unforgiving on purpose.
 *
 * Cross-references:
 *  - CLAUDE.md rule 16 (pure domain) — this file must not import I/O.
 *  - CLAUDE.md operational quirks → "Breaker is property-tested"
 *  - `decisions.md` Entry 3 (hexagonal hybrid) — why this kind of
 *    domain logic earns its own layer.
 */
import type { BreakerConfig, BreakerState } from './types.js';
import type { Confidence, Millis } from '@price-oracle/contracts/primitives';

/**
 * Inputs to one breaker transition.
 *
 *  - `confidence`: the *current* pulse's confidence (the orchestrator
 *                  already aggregated; this is what came out).
 *  - `streak`:     consecutive count of *bad* pulses while CLOSED, or
 *                  *good* probes while HALF_OPEN. Reset semantics live
 *                  in the orchestrator (`advanceBreaker`).
 *  - `openedAt`:   wall-clock millis at which we entered OPEN. `null`
 *                  whenever we are not OPEN. Used solely by the OPEN →
 *                  HALF_OPEN time check.
 */
export type BreakerInput = {
  readonly confidence: Confidence;
  readonly streak: number;
  readonly openedAt: Millis | null;
};

/**
 * Const-asserted table of state literals. CLAUDE.md rule 3 ("no
 * hardcoded strings for status, roles, events, or types") — every
 * comparison in this file goes through these symbols, never a bare
 * `'CLOSED'` literal. The `satisfies` clause keeps the table in
 * lock-step with the union type: removing a variant from
 * `BreakerState` breaks compilation here, not at the call sites.
 */
const BreakerStates = {
  CLOSED: 'CLOSED',
  HALF_OPEN: 'HALF_OPEN',
  OPEN: 'OPEN',
} as const satisfies Record<BreakerState, BreakerState>;

/**
 * Compute the next breaker state given the current state and one
 * pulse's worth of input.
 *
 * Decision tree (in the order the function reads):
 *
 *  - **CLOSED**:
 *      below-floor *and* streak met → OPEN.
 *      else                          → stay CLOSED.
 *
 *  - **OPEN**:
 *      `recoveryWindowMs` elapsed    → HALF_OPEN (open the door to probes).
 *      else                          → stay OPEN (cannot close directly).
 *
 *  - **HALF_OPEN**:
 *      below-floor on any probe      → OPEN (re-trip, unforgiving).
 *      probe streak met              → CLOSED (recovered).
 *      else                          → stay HALF_OPEN (need more good probes).
 *
 * Note that this function does **not** mutate the input. Side effects
 * (setting `openedAt`, resetting `streak`, emitting audit events)
 * happen in `orchestrator.ts::advanceBreaker`, which is the only call
 * site. Keeping those concerns out of the FSM is what makes property
 * testing tractable.
 *
 * @param prev  Current breaker state.
 * @param input Confidence and streak for *this* pulse, plus the
 *              opened-at timestamp (relevant only when `prev === OPEN`).
 * @param now   Wall-clock millis at the pulse's start. Used solely
 *              by the recovery-window check.
 * @param cfg   Breaker tuning (floor, two streak lengths, recovery window).
 * @returns The next breaker state. May equal `prev`.
 */
export const transitionBreaker = (
  prev: BreakerState,
  input: BreakerInput,
  now: Millis,
  cfg: BreakerConfig,
): BreakerState => {
  const belowFloor = input.confidence < cfg.confidenceFloor;

  if (prev === BreakerStates.CLOSED) {
    // CLOSED trips only when confidence has been *consistently* low.
    // The streak counter is the caller's responsibility; we just read it.
    if (belowFloor && input.streak >= cfg.tripStreak) return BreakerStates.OPEN;
    return BreakerStates.CLOSED;
  }

  if (prev === BreakerStates.OPEN) {
    // Time-gated transition only — OPEN cannot jump straight to
    // CLOSED. The recovery window is what gives the upstream a chance
    // to actually heal before we start re-evaluating.
    if (input.openedAt !== null && now - input.openedAt >= cfg.recoveryWindowMs) {
      return BreakerStates.HALF_OPEN;
    }
    return BreakerStates.OPEN;
  }

  // HALF_OPEN: unforgiving on any bad probe.
  if (belowFloor) return BreakerStates.OPEN;
  // Probe streak satisfied: recovery confirmed, close.
  if (input.streak >= cfg.halfOpenProbeStreak) return BreakerStates.CLOSED;
  // Still gathering probe evidence.
  return BreakerStates.HALF_OPEN;
};
