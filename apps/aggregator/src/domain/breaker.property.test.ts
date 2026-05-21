import fc from 'fast-check';
import { describe, it } from 'vitest';

import { transitionBreaker, type BreakerInput } from './breaker.js';

import type { BreakerConfig, BreakerState } from './types.js';

const BREAKER_STATES: readonly BreakerState[] = ['CLOSED', 'HALF_OPEN', 'OPEN'];

const millis = fc.integer({ min: 0, max: 10 ** 12 });
const unit = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

const cfgArb: fc.Arbitrary<BreakerConfig> = fc.record({
  confidenceFloor: fc.double({ min: 0.1, max: 0.9, noNaN: true, noDefaultInfinity: true }),
  tripStreak: fc.integer({ min: 2, max: 10 }),
  recoveryWindowMs: fc.integer({ min: 1, max: 60_000 }),
  halfOpenProbeStreak: fc.integer({ min: 2, max: 10 }),
});

const inputArb: fc.Arbitrary<BreakerInput> = fc.record({
  confidence: unit,
  streak: fc.integer({ min: 0, max: 20 }),
  openedAt: fc.option(millis, { nil: null }),
});

type Runtime = { state: BreakerState; streak: number; openedAt: number | null };

// The streak counter is the orchestrator's application state, not the FSM's; this
// models that bookkeeping so the anti-flapping property can be driven end-to-end.
const step = (rt: Runtime, confidence: number, now: number, cfg: BreakerConfig): Runtime => {
  const belowFloor = confidence < cfg.confidenceFloor;
  let streak: number;
  if (rt.state === 'CLOSED') streak = belowFloor ? rt.streak + 1 : 0;
  else if (rt.state === 'HALF_OPEN') streak = belowFloor ? 0 : rt.streak + 1;
  else streak = 0;

  const next = transitionBreaker(rt.state, { confidence, streak, openedAt: rt.openedAt }, now, cfg);
  if (next !== rt.state) {
    return { state: next, streak: 0, openedAt: next === 'OPEN' ? now : null };
  }
  return { state: next, streak, openedAt: rt.openedAt };
};

describe('transitionBreaker (properties)', () => {
  it('should always return one of the three breaker states', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BREAKER_STATES),
        inputArb,
        millis,
        cfgArb,
        (prev, input, now, cfg) =>
          BREAKER_STATES.includes(transitionBreaker(prev, input, now, cfg)),
      ),
    );
  });

  it('should never transition from OPEN to CLOSED directly', () => {
    fc.assert(
      fc.property(inputArb, millis, cfgArb, (input, now, cfg) => {
        return transitionBreaker('OPEN', input, now, cfg) !== 'CLOSED';
      }),
    );
  });

  it('should not leave OPEN before the recovery window elapses', () => {
    fc.assert(
      fc.property(
        unit,
        fc.integer({ min: 60_000, max: 10 ** 12 }),
        cfgArb,
        fc.nat(),
        (confidence, now, cfg, seed) => {
          const elapsed = seed % cfg.recoveryWindowMs;
          const openedAt = now - elapsed;
          return (
            transitionBreaker('OPEN', { confidence, streak: 0, openedAt }, now, cfg) === 'OPEN'
          );
        },
      ),
    );
  });

  it('should move OPEN to HALF_OPEN once the recovery window has elapsed', () => {
    fc.assert(
      fc.property(
        unit,
        fc.integer({ min: 60_000, max: 10 ** 12 }),
        cfgArb,
        fc.nat(),
        (confidence, now, cfg, seed) => {
          const openedAt = now - (cfg.recoveryWindowMs + (seed % 10_000));
          return (
            transitionBreaker('OPEN', { confidence, streak: 0, openedAt }, now, cfg) === 'HALF_OPEN'
          );
        },
      ),
    );
  });

  it('should close from HALF_OPEN once good probes reach the probe streak', () => {
    fc.assert(
      fc.property(cfgArb, fc.nat({ max: 10 }), unit, millis, (cfg, extra, frac, now) => {
        const goodConfidence = cfg.confidenceFloor + frac * (1 - cfg.confidenceFloor);
        const streak = cfg.halfOpenProbeStreak + extra;
        return (
          transitionBreaker(
            'HALF_OPEN',
            { confidence: goodConfidence, streak, openedAt: null },
            now,
            cfg,
          ) === 'CLOSED'
        );
      }),
    );
  });

  it('should reopen from HALF_OPEN on any below-floor probe regardless of streak', () => {
    fc.assert(
      fc.property(
        cfgArb,
        fc.integer({ min: 0, max: 50 }),
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true, noDefaultInfinity: true }),
        millis,
        (cfg, streak, belowFrac, now) => {
          const badConfidence = cfg.confidenceFloor * belowFrac;
          return (
            transitionBreaker(
              'HALF_OPEN',
              { confidence: badConfidence, streak, openedAt: null },
              now,
              cfg,
            ) === 'OPEN'
          );
        },
      ),
    );
  });

  it('should not flap: alternating confidence from CLOSED changes state at most once', () => {
    fc.assert(
      fc.property(
        cfgArb,
        fc.integer({ min: 1, max: 60 }),
        fc.boolean(),
        (cfg, length, startBelow) => {
          let rt: Runtime = { state: 'CLOSED', streak: 0, openedAt: null };
          let now = 0;
          let changes = 0;
          const below = cfg.confidenceFloor / 2;
          const above = (cfg.confidenceFloor + 1) / 2;
          for (let i = 0; i < length; i++) {
            const isBelow = startBelow ? i % 2 === 0 : i % 2 === 1;
            const next = step(rt, isBelow ? below : above, now, cfg);
            if (next.state !== rt.state) changes += 1;
            rt = next;
            now += 500;
          }
          return changes <= 1;
        },
      ),
    );
  });
});
