import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbMillis, arbPrice, arbSourceState, arbThresholds } from './__test-helpers__/arbitraries.js';
import { updateSourceState } from './source-state.js';

import type { SourceState, Thresholds, Tick } from './types.js';

type Op = { readonly asset: 'btc' | 'eth'; readonly tick: Tick | null; readonly now: number };

const opArb: fc.Arbitrary<Op> = fc
  .record({
    asset: fc.constantFrom('btc' as const, 'eth' as const),
    hasTick: fc.boolean(),
    price: arbPrice,
    receivedAt: arbMillis,
    now: arbMillis,
  })
  .map(({ asset, hasTick, price, receivedAt, now }) => ({
    asset,
    tick: hasTick ? { asset, source: 'binance' as const, price, receivedAt } : null,
    now,
  }));

function fold(init: SourceState, ops: readonly Op[], cfg: Thresholds): SourceState {
  return ops.reduce((state, op) => updateSourceState(state, op.tick, op.now, cfg), init);
}

describe('per-asset isolation', () => {
  // Regression guard for the "asset is a first-class dimension" invariant: if a
  // transition ever shared state across assets (e.g. a cache keyed by source only),
  // the interleaved run would diverge from the per-asset isolated runs.
  it('should keep each asset slice independent under interleaved updates', () => {
    fc.assert(
      fc.property(
        arbThresholds,
        arbSourceState,
        arbSourceState,
        fc.array(opArb, { maxLength: 40 }),
        (cfg, btcInitRaw, ethInitRaw, ops) => {
          const btcInit: SourceState = { ...btcInitRaw, asset: 'btc' };
          const ethInit: SourceState = { ...ethInitRaw, asset: 'eth' };

          const isolatedBtc = fold(btcInit, ops.filter((o) => o.asset === 'btc'), cfg);
          const isolatedEth = fold(ethInit, ops.filter((o) => o.asset === 'eth'), cfg);

          let btc = btcInit;
          let eth = ethInit;
          for (const op of ops) {
            if (op.asset === 'btc') btc = updateSourceState(btc, op.tick, op.now, cfg);
            else eth = updateSourceState(eth, op.tick, op.now, cfg);
          }

          expect(btc).toEqual(isolatedBtc);
          expect(eth).toEqual(isolatedEth);
        },
      ),
    );
  });

  it('should not mutate either input slice during interleaved updates', () => {
    fc.assert(
      fc.property(arbThresholds, arbSourceState, fc.array(opArb, { maxLength: 20 }), (cfg, initRaw, ops) => {
        const init: SourceState = { ...initRaw, asset: 'btc' };
        const snapshot = { ...init };
        let state = init;
        for (const op of ops) {
          if (op.asset === 'btc') state = updateSourceState(state, op.tick, op.now, cfg);
        }
        expect(init).toEqual(snapshot);
      }),
    );
  });
});
