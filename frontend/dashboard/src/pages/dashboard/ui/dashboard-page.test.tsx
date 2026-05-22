import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './dashboard-page.js';

import type { RenderResult } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';

class MockEventSource {
  static readonly CLOSED = 2;
  private static _last: MockEventSource | null = null;
  static get last(): MockEventSource | null {
    return MockEventSource._last;
  }
  static resetLast(): void {
    MockEventSource._last = null;
  }
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readyState = 0;
  readonly close = vi.fn();
  constructor(readonly url: string) {
    MockEventSource._last = this;
  }
}

const WIDGET_SLOTS = ['price-overview', 'source-health', 'audit-timeline', 'diagnose-panel', 'chaos-controls'] as const;

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
  MockEventSource.resetLast();
});

function renderPage(): RenderResult {
  const client = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<DashboardPage />, { wrapper: Wrapper });
}

describe('DashboardPage', () => {
  it('should render the dashboard heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Price Oracle' })).toBeInTheDocument();
  });

  it('should compose all five operator widgets', () => {
    const { container } = renderPage();
    for (const slot of WIDGET_SLOTS) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
    }
  });

  it('should not show the reconnect indicator while the stream is open', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(MockEventSource.last).not.toBeNull());
    act(() => MockEventSource.last?.onopen?.());
    expect(container.querySelector('[data-slot="sse-status"]')).toBeNull();
  });

  it('should show the reconnect indicator when the stream is reconnecting', async () => {
    renderPage();
    await waitFor(() => expect(MockEventSource.last).not.toBeNull());
    act(() => MockEventSource.last?.onerror?.());
    expect(await screen.findByText('Reconnecting…')).toBeInTheDocument();
  });
});
