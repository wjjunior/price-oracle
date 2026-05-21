import { beforeEach, describe, expect, it } from 'vitest';

import { ChaosMode } from './chaos-mode.js';
import { ChaosStateService } from './chaos-state.service.js';

describe('ChaosStateService', () => {
  let svc: ChaosStateService;

  beforeEach(() => {
    svc = new ChaosStateService();
  });

  it('should initialize both assets as healthy', () => {
    expect(svc.get('btc').mode).toBe(ChaosMode.HEALTHY);
    expect(svc.get('eth').mode).toBe(ChaosMode.HEALTHY);
  });

  it('should transition healthy to disconnected', () => {
    svc.setDisconnected('btc', 1_000);
    expect(svc.get('btc')).toEqual({ mode: ChaosMode.DISCONNECTED, since: 1_000 });
  });

  it('should remain in disconnected when setDisconnected called twice (idempotent since unchanged)', () => {
    svc.setDisconnected('btc', 1_000);
    svc.setDisconnected('btc', 2_000);
    expect(svc.get('btc')).toEqual({ mode: ChaosMode.DISCONNECTED, since: 1_000 });
  });

  it('should snapshot price and source timestamp when entering stale', () => {
    svc.setStale('btc', 1_500, 95_000, 1_400);
    expect(svc.get('btc')).toEqual({
      mode: ChaosMode.STALE,
      since: 1_500,
      frozenPrice: 95_000,
      frozenSourceTimestamp: 1_400,
    });
  });

  it('should keep original snapshot when setStale called twice', () => {
    svc.setStale('btc', 1_500, 95_000, 1_400);
    svc.setStale('btc', 2_500, 96_000, 2_400);
    expect(svc.get('btc')).toEqual({
      mode: ChaosMode.STALE,
      since: 1_500,
      frozenPrice: 95_000,
      frozenSourceTimestamp: 1_400,
    });
  });

  it('should transition to malformed', () => {
    svc.setMalformed('eth', 3_000);
    expect(svc.get('eth')).toEqual({ mode: ChaosMode.MALFORMED, since: 3_000 });
  });

  it('should reset an asset back to healthy', () => {
    svc.setDisconnected('btc', 1_000);
    svc.reset('btc', 5_000);
    expect(svc.get('btc')).toEqual({ mode: ChaosMode.HEALTHY, since: 5_000 });
  });

  it('should isolate state mutations across assets', () => {
    svc.setStale('btc', 1_000, 95_000, 900);
    expect(svc.get('eth').mode).toBe(ChaosMode.HEALTHY);
    svc.setMalformed('eth', 2_000);
    expect(svc.get('btc').mode).toBe(ChaosMode.STALE);
  });

  it('should restore both assets to healthy on resetAll', () => {
    svc.setDisconnected('btc', 1_000);
    svc.setMalformed('eth', 1_500);
    svc.resetAll(9_000);
    expect(svc.get('btc')).toEqual({ mode: ChaosMode.HEALTHY, since: 9_000 });
    expect(svc.get('eth')).toEqual({ mode: ChaosMode.HEALTHY, since: 9_000 });
  });

  it('should return both assets in snapshot()', () => {
    svc.setDisconnected('btc', 1_000);
    const snap = svc.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap.find((s) => s.asset === 'btc')?.state.mode).toBe(ChaosMode.DISCONNECTED);
    expect(snap.find((s) => s.asset === 'eth')?.state.mode).toBe(ChaosMode.HEALTHY);
  });
});
