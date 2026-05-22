import { Injectable } from '@nestjs/common';

import { ChaosMode, type ChaosState } from './chaos-mode.js';

import type { AssetId, Millis, Price } from '@price-oracle/contracts/primitives';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];
const INITIAL_TIME: Millis = 0;

@Injectable()
export class ChaosStateService {
  private readonly states: Record<AssetId, ChaosState> = {
    btc: { mode: ChaosMode.HEALTHY, since: INITIAL_TIME },
    eth: { mode: ChaosMode.HEALTHY, since: INITIAL_TIME },
  };

  get(asset: AssetId): ChaosState {
    return this.states[asset];
  }

  setDisconnected(asset: AssetId, now: Millis): void {
    if (this.states[asset].mode === ChaosMode.DISCONNECTED) return;
    this.states[asset] = { mode: ChaosMode.DISCONNECTED, since: now };
  }

  setStale(asset: AssetId, now: Millis, frozenPrice: Price, frozenSourceTimestamp: Millis): void {
    if (this.states[asset].mode === ChaosMode.STALE) return;
    this.states[asset] = {
      mode: ChaosMode.STALE,
      since: now,
      frozenPrice,
      frozenSourceTimestamp,
    };
  }

  setMalformed(asset: AssetId, now: Millis): void {
    if (this.states[asset].mode === ChaosMode.MALFORMED) return;
    this.states[asset] = { mode: ChaosMode.MALFORMED, since: now };
  }

  reset(asset: AssetId, now: Millis): void {
    if (this.states[asset].mode === ChaosMode.HEALTHY) return;
    this.states[asset] = { mode: ChaosMode.HEALTHY, since: now };
  }

  resetAll(now: Millis): void {
    for (const asset of ASSETS) this.reset(asset, now);
  }

  snapshot(): Array<{ asset: AssetId; state: ChaosState }> {
    return ASSETS.map((asset) => ({ asset, state: this.states[asset] }));
  }
}
