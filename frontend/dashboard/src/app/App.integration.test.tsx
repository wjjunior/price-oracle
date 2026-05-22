import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

import { useAuditStore } from '@/entities/audit-event/model/audit-store.js';
import { usePriceAggregateStore } from '@/entities/price-aggregate/model/price-store.js';
import { useSourceStore } from '@/entities/source/model/source-store.js';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }), Toaster: () => null }));

class MockEventSource {
  static readonly CLOSED = 2;
  static last: MockEventSource | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readyState = 0;
  readonly close = vi.fn();
  constructor(readonly url: string) {
    MockEventSource.last = this;
  }
  emit(envelope: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(envelope) }));
  }
}

const aggregate = (asset: 'btc' | 'eth', price: number, computedAt: number) => ({
  asset,
  price,
  confidence: 0.95,
  contributingSources: ['binance'],
  computedAt,
});
const snapshot = (asset: 'btc' | 'eth', price: number) => ({
  asset,
  aggregate: aggregate(asset, price, 1),
  sources: [],
  breaker: 'CLOSED',
});
const jsonResponse = (body: unknown): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
  );

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

describe('App integration', () => {
  it('should render a hydrated price and update it from an SSE delta', async () => {
    render(<App />);
    expect(await screen.findByText('$65,000.00')).toBeInTheDocument();

    await waitFor(() => expect(MockEventSource.last).not.toBeNull());
    act(() =>
      MockEventSource.last?.emit({
        type: 'aggregate',
        asset: 'btc',
        data: aggregate('btc', 70_000, 2),
        correlationId: 'c1',
      }),
    );
    expect(await screen.findByText('$70,000.00')).toBeInTheDocument();
  });
});
