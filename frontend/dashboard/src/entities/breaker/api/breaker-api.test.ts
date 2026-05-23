import { beforeEach, describe, expect, it } from 'vitest';

import { useBreakerStore } from '../model/breaker-store.js';

import { applyBreakerStateEnvelope, hydrateFromSnapshot } from './breaker-api.js';

beforeEach(() => useBreakerStore.setState({ byAsset: { btc: 'CLOSED', eth: 'CLOSED' } }));

describe('applyBreakerStateEnvelope', () => {
  it('should route a breaker-state envelope into the targeted asset', () => {
    applyBreakerStateEnvelope({
      type: 'breaker-state',
      asset: 'btc',
      data: 'OPEN',
      correlationId: 'c-1',
    });
    expect(useBreakerStore.getState().byAsset.btc).toBe('OPEN');
    expect(useBreakerStore.getState().byAsset.eth).toBe('CLOSED');
  });
});

describe('hydrateFromSnapshot', () => {
  it('should seed the breaker state from a snapshot', () => {
    hydrateFromSnapshot({ asset: 'eth', aggregate: null, sources: [], breaker: 'HALF_OPEN' });
    expect(useBreakerStore.getState().byAsset.eth).toBe('HALF_OPEN');
  });
});
