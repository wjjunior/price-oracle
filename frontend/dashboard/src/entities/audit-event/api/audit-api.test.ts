import {
  buildBreakerStateChangedEvent,
  buildSourceStateChangedEvent,
} from '@price-oracle/contracts/events';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuditStore } from '../model/audit-store.js';

import { applyAuditEnvelope, seedAuditEvents } from './audit-api.js';

import type { GetAuditResponse } from '@price-oracle/contracts/rest';
import type { SseEnvelope } from '@price-oracle/contracts/sse';

beforeEach(() => useAuditStore.setState({ events: [] }));

describe('applyAuditEnvelope', () => {
  it('should append an audit SSE envelope to the timeline', () => {
    const envelope: Extract<SseEnvelope, { type: 'audit' }> = {
      type: 'audit',
      data: buildBreakerStateChangedEvent({ asset: 'btc', from: 'CLOSED', to: 'OPEN', reason: 'x', at: 2_000 }),
      correlationId: 'corr-1',
    };
    applyAuditEnvelope(envelope);
    expect(useAuditStore.getState().events).toHaveLength(1);
    expect(useAuditStore.getState().events[0]?.type).toBe('BreakerStateChanged');
  });
});

describe('seedAuditEvents', () => {
  it('should seed the timeline from a REST audit response', () => {
    const response: GetAuditResponse = {
      events: [
        buildSourceStateChangedEvent({ asset: 'btc', source: 'binance', from: 'HEALTHY', to: 'STALE', at: 1_000 }),
        buildSourceStateChangedEvent({ asset: 'eth', source: 'mock', from: 'HEALTHY', to: 'DEGRADED', at: 2_000 }),
      ],
    };
    seedAuditEvents(response);
    expect(useAuditStore.getState().events.map((e) => e.at)).toEqual([2_000, 1_000]);
  });
});
