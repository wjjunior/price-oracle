import { describe, expect, it } from 'vitest';

import { buildOrchestratorConfig } from './orchestrator.config.js';

describe('buildOrchestratorConfig', () => {
  it('should apply production defaults when env is empty', () => {
    const cfg = buildOrchestratorConfig({});
    expect(cfg.assets).toEqual(['btc', 'eth']);
    expect(cfg.sources).toEqual(['mock']);
    expect(cfg.aggregationIntervalMs).toBe(500);
    expect(cfg.breaker.recoveryWindowMs).toBe(30_000);
    expect(cfg.breaker.tripStreak).toBe(6);
  });

  it('should default to thresholds tuned to tolerate real-feed jitter', () => {
    const cfg = buildOrchestratorConfig({});
    expect(cfg.thresholds.degradedAfterMs).toBe(5_000);
    expect(cfg.thresholds.staleAfterMs).toBe(12_000);
    expect(cfg.thresholds.freshnessDecayMs).toBe(12_000);
    expect(cfg.thresholds.healthHysteresisStreak).toBe(3);
  });

  it('should override sources and timing from env for fast deterministic runs', () => {
    const cfg = buildOrchestratorConfig({
      AGGREGATOR_SOURCES: 'mock',
      AGGREGATION_INTERVAL_MS: '100',
      BREAKER_TRIP_STREAK: '3',
      BREAKER_RECOVERY_WINDOW_MS: '1500',
      DEGRADED_AFTER_MS: '300',
      STALE_AFTER_MS: '600',
    });
    expect(cfg.sources).toEqual(['mock']);
    expect(cfg.aggregationIntervalMs).toBe(100);
    expect(cfg.breaker.tripStreak).toBe(3);
    expect(cfg.breaker.recoveryWindowMs).toBe(1_500);
    expect(cfg.thresholds.staleAfterMs).toBe(600);
  });

  it('should reject an unknown source id', () => {
    expect(() => buildOrchestratorConfig({ AGGREGATOR_SOURCES: 'mock,kucoin' })).toThrow();
  });

  it('should reject a non-positive interval', () => {
    expect(() => buildOrchestratorConfig({ AGGREGATION_INTERVAL_MS: '0' })).toThrow();
  });

  it('should reject DEGRADED_AFTER_MS greater than STALE_AFTER_MS', () => {
    expect(() => buildOrchestratorConfig({ DEGRADED_AFTER_MS: '13000' })).toThrow();
  });

  it('should reject STALE_AFTER_MS greater than FRESHNESS_DECAY_MS', () => {
    expect(() => buildOrchestratorConfig({ STALE_AFTER_MS: '13000' })).toThrow();
  });

  it('should reject duplicate sources', () => {
    expect(() => buildOrchestratorConfig({ AGGREGATOR_SOURCES: 'mock,mock' })).toThrow();
  });

  it('should reject duplicate assets', () => {
    expect(() => buildOrchestratorConfig({ AGGREGATOR_ASSETS: 'btc,btc' })).toThrow();
  });
});
