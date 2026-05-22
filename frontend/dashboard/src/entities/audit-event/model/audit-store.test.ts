import { buildSourceStateChangedEvent } from '@price-oracle/contracts/events';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_AUDIT_EVENTS, useAuditStore } from './audit-store.js';

const ssc = (at: number, source: 'binance' | 'coinbase' | 'mock' = 'binance') =>
  buildSourceStateChangedEvent({ asset: 'btc', source, from: 'HEALTHY', to: 'DEGRADED', at });

beforeEach(() => useAuditStore.setState({ events: [] }));

describe('useAuditStore', () => {
  it('should keep events newest-first by timestamp', () => {
    useAuditStore.getState().append(ssc(1_000));
    useAuditStore.getState().append(ssc(2_000));
    expect(useAuditStore.getState().events.map((e) => e.at)).toEqual([2_000, 1_000]);
  });

  it('should deduplicate by content (type, asset, source, at), not by insertion order', () => {
    useAuditStore.getState().seed([ssc(1_000), ssc(2_000)]);
    useAuditStore.getState().append(ssc(1_000));
    expect(useAuditStore.getState().events).toHaveLength(2);
  });

  it('should keep two same-timestamp events that differ only by source', () => {
    useAuditStore.getState().seed([ssc(1_000, 'binance'), ssc(1_000, 'coinbase')]);
    expect(useAuditStore.getState().events).toHaveLength(2);
  });

  it('should merge a REST seed with SSE-appended events without duplicates', () => {
    useAuditStore.getState().append(ssc(3_000));
    useAuditStore.getState().seed([ssc(1_000), ssc(3_000)]);
    expect(useAuditStore.getState().events.map((e) => e.at)).toEqual([3_000, 1_000]);
  });

  it('should cap the buffer and evict the oldest events', () => {
    for (let i = 1; i <= MAX_AUDIT_EVENTS + 10; i += 1) useAuditStore.getState().append(ssc(i));
    const events = useAuditStore.getState().events;
    expect(events).toHaveLength(MAX_AUDIT_EVENTS);
    expect(events[0]?.at).toBe(MAX_AUDIT_EVENTS + 10);
    expect(events.at(-1)?.at).toBe(11);
  });
});
