import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSseClient, type SseConnectionState } from './sse-client.js';

import type { SseEnvelope } from '@price-oracle/contracts/sse';

class MockEventSource {
  static readonly instances: MockEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readyState = MockEventSource.CONNECTING;
  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }
  emit(payload: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }
  emitRaw(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
  fail(readyState: number): void {
    this.readyState = readyState;
    this.onerror?.();
  }
}

const latest = (): MockEventSource => {
  const es = MockEventSource.instances.at(-1);
  if (es === undefined) throw new Error('no EventSource created');
  return es;
};

const aggregateEnvelope: SseEnvelope = {
  type: 'aggregate',
  asset: 'btc',
  data: {
    asset: 'btc',
    price: 65_000,
    confidence: 0.95,
    contributingSources: ['binance'],
    computedAt: 1_747_000_000_000,
  },
  correlationId: 'corr-1',
};

const auditEnvelope: SseEnvelope = {
  type: 'audit',
  data: {
    type: 'SourceStateChanged',
    asset: 'eth',
    source: 'mock',
    from: 'HEALTHY',
    to: 'STALE',
    at: 1,
  },
  correlationId: 'corr-2',
};

beforeEach(() => vi.stubGlobal('EventSource', MockEventSource));

afterEach(() => {
  MockEventSource.instances.length = 0;
  vi.unstubAllGlobals();
});

describe('createSseClient', () => {
  it('should start connecting and transition to open', () => {
    const states: SseConnectionState[] = [];
    const client = createSseClient('/events');
    client.onStateChange((s) => states.push(s));
    expect(client.getState()).toBe('connecting');

    latest().onopen?.();

    expect(client.getState()).toBe('open');
    expect(states).toContain('open');
  });

  it('should deliver only envelopes matching a subscriber (type, asset) filter', () => {
    const client = createSseClient('/events');
    const received: SseEnvelope[] = [];
    client.subscribe({ type: 'aggregate', asset: 'btc' }, (e) => received.push(e));

    latest().emit(aggregateEnvelope);
    latest().emit({
      ...aggregateEnvelope,
      asset: 'eth',
      data: { ...aggregateEnvelope.data, asset: 'eth' },
    });
    latest().emit(auditEnvelope);

    expect(received).toEqual([aggregateEnvelope]);
  });

  it('should deliver audit envelopes to a type-only audit subscriber', () => {
    const client = createSseClient('/events');
    const received: SseEnvelope[] = [];
    client.subscribe({ type: 'audit' }, (e) => received.push(e));

    latest().emit(auditEnvelope);
    latest().emit(aggregateEnvelope);

    expect(received).toEqual([auditEnvelope]);
  });

  it('should surface a reconnecting state on a transient error', () => {
    const client = createSseClient('/events');
    latest().onopen?.();
    latest().fail(MockEventSource.CONNECTING);
    expect(client.getState()).toBe('reconnecting');
  });

  it('should surface a closed state when the source is closed by the server', () => {
    const client = createSseClient('/events');
    latest().fail(MockEventSource.CLOSED);
    expect(client.getState()).toBe('closed');
  });

  it('should drop envelopes that fail contract validation', () => {
    const client = createSseClient('/events');
    const received: SseEnvelope[] = [];
    client.subscribe({ type: 'aggregate', asset: 'btc' }, (e) => received.push(e));

    latest().emit({ type: 'aggregate', asset: 'btc', data: { nope: true }, correlationId: 'x' });
    latest().emitRaw('not-json{');

    expect(received).toEqual([]);
  });

  it('should stop delivering to a subscriber after it unsubscribes', () => {
    const client = createSseClient('/events');
    const received: SseEnvelope[] = [];
    const unsubscribe = client.subscribe({ type: 'aggregate', asset: 'btc' }, (e) =>
      received.push(e),
    );

    unsubscribe();
    latest().emit(aggregateEnvelope);

    expect(received).toEqual([]);
  });

  it('should close the source and report closed on close()', () => {
    const client = createSseClient('/events');
    client.close();
    expect(client.getState()).toBe('closed');
    expect(latest().readyState).toBe(MockEventSource.CLOSED);
  });
});
