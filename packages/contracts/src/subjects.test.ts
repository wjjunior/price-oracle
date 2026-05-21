import { describe, expect, it } from 'vitest';

import {
  AGGREGATES_SUBSCRIPTION_PATTERN,
  aggregatesSubject,
  TICKS_SUBSCRIPTION_PATTERN,
  ticksSubject,
} from './subjects.js';

describe('ticksSubject', () => {
  it('builds ticks.<asset>.<source>', () => {
    expect(ticksSubject('btc', 'binance')).toBe('ticks.btc.binance');
    expect(ticksSubject('eth', 'coinbase')).toBe('ticks.eth.coinbase');
    expect(ticksSubject('btc', 'mock')).toBe('ticks.btc.mock');
  });
});

describe('aggregatesSubject', () => {
  it('builds aggregates.<asset>', () => {
    expect(aggregatesSubject('btc')).toBe('aggregates.btc');
    expect(aggregatesSubject('eth')).toBe('aggregates.eth');
  });
});

describe('subscription patterns', () => {
  it('exposes ticks.> for the aggregator-side wildcard subscription', () => {
    expect(TICKS_SUBSCRIPTION_PATTERN).toBe('ticks.>');
  });
  it('exposes aggregates.> for downstream consumers', () => {
    expect(AGGREGATES_SUBSCRIPTION_PATTERN).toBe('aggregates.>');
  });
});
