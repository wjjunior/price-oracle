import { describe, expect, it } from 'vitest';

import {
  AGGREGATES_SUBSCRIPTION_PATTERN,
  aggregatesSubject,
  TICKS_SUBSCRIPTION_PATTERN,
  ticksSubject,
} from './subjects.js';

describe('ticksSubject', () => {
  it('should build ticks.<asset>.<source>', () => {
    expect(ticksSubject('btc', 'binance')).toBe('ticks.btc.binance');
    expect(ticksSubject('eth', 'coinbase')).toBe('ticks.eth.coinbase');
    expect(ticksSubject('btc', 'mock')).toBe('ticks.btc.mock');
  });
});

describe('aggregatesSubject', () => {
  it('should build aggregates.<asset>', () => {
    expect(aggregatesSubject('btc')).toBe('aggregates.btc');
    expect(aggregatesSubject('eth')).toBe('aggregates.eth');
  });
});

describe('subscription patterns', () => {
  it('should expose the ticks.> wildcard for the aggregator', () => {
    expect(TICKS_SUBSCRIPTION_PATTERN).toBe('ticks.>');
  });
  it('should expose the aggregates.> wildcard for downstream consumers', () => {
    expect(AGGREGATES_SUBSCRIPTION_PATTERN).toBe('aggregates.>');
  });
});
