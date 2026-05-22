import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDashboardData } from './use-dashboard-data.js';

import { useAuditStore } from '@/entities/audit-event/model/audit-store.js';
import { usePriceAggregateStore } from '@/entities/price-aggregate/model/price-store.js';
import { useSourceStore } from '@/entities/source/model/source-store.js';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static last: MockEventSource | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readyState = MockEventSource.CONNECTING;
  readonly close = vi.fn(() => {
    this.readyState = MockEventSource.CLOSED;
  });
  constructor(readonly url: string) {
    MockEventSource.last = this;
  }
  emit(envelope: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(envelope) }));
  }
}

function snapshot(asset: 'btc' | 'eth', price: number) {
  return {
    asset,
    aggregate: { asset, price, confidence: 0.95, contributingSources: ['binance'], computedAt: 1 },
    sources: [],
    breaker: 'CLOSED',
  };
}

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

beforeEach(() => {
  vi.stubGlobal('EventSource', MockEventSource);
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/snapshot?asset=btc')) return jsonResponse(snapshot('btc', 65_000));
    if (url.includes('/api/snapshot?asset=eth')) return jsonResponse(snapshot('eth', 3_000));
    if (url.includes('/api/audit')) return jsonResponse({ events: [] });
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  MockEventSource.last = null;
  usePriceAggregateStore.setState({ byAsset: { btc: null, eth: null } });
  useSourceStore.setState({ byAsset: { btc: {}, eth: {} } });
  useAuditStore.setState({ events: [] });
});

describe('useDashboardData', () => {
  it('should hydrate the price store from the snapshot on mount', async () => {
    renderHook(() => useDashboardData());
    await waitFor(() => expect(usePriceAggregateStore.getState().byAsset.btc?.price).toBe(65_000));
  });

  it('should route an aggregate SSE delta into the price store', async () => {
    renderHook(() => useDashboardData());
    await waitFor(() => expect(MockEventSource.last).not.toBeNull());
    act(() =>
      MockEventSource.last?.emit({
        type: 'aggregate',
        asset: 'btc',
        data: { asset: 'btc', price: 70_000, confidence: 0.95, contributingSources: ['binance'], computedAt: 2 },
        correlationId: 'c1',
      }),
    );
    await waitFor(() => expect(usePriceAggregateStore.getState().byAsset.btc?.price).toBe(70_000));
  });

  it('should reflect the SSE connection state when the stream errors', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(MockEventSource.last).not.toBeNull());
    act(() => {
      MockEventSource.last!.readyState = MockEventSource.CONNECTING;
      MockEventSource.last?.onerror?.();
    });
    await waitFor(() => expect(result.current.connectionState).toBe('reconnecting'));
  });

  it('should close the SSE client on unmount', async () => {
    const { unmount } = renderHook(() => useDashboardData());
    await waitFor(() => expect(MockEventSource.last).not.toBeNull());
    const client = MockEventSource.last;
    unmount();
    expect(client?.close).toHaveBeenCalled();
  });
});
