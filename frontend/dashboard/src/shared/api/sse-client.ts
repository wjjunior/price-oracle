import { SseEnvelopeSchema, type SseEnvelope } from '@price-oracle/contracts/sse';

import type { AssetId } from '@price-oracle/contracts/primitives';

export const SseConnectionState = {
  connecting: 'connecting',
  open: 'open',
  reconnecting: 'reconnecting',
  closed: 'closed',
} as const;
export type SseConnectionState = (typeof SseConnectionState)[keyof typeof SseConnectionState];

export type SseSubscriptionFilter = {
  type: SseEnvelope['type'];
  asset?: AssetId;
};

export type SseClient = {
  subscribe(filter: SseSubscriptionFilter, handler: (envelope: SseEnvelope) => void): () => void;
  onStateChange(handler: (state: SseConnectionState) => void): () => void;
  getState(): SseConnectionState;
  close(): void;
};

type Subscription = { filter: SseSubscriptionFilter; handler: (envelope: SseEnvelope) => void };

function matches(envelope: SseEnvelope, filter: SseSubscriptionFilter): boolean {
  if (envelope.type !== filter.type) return false;
  if (filter.asset === undefined) return true;
  return 'asset' in envelope && envelope.asset === filter.asset;
}

export function createSseClient(url: string): SseClient {
  const subscriptions = new Set<Subscription>();
  const stateListeners = new Set<(state: SseConnectionState) => void>();
  let state: SseConnectionState = SseConnectionState.connecting;

  const setState = (next: SseConnectionState): void => {
    if (next === state) return;
    state = next;
    for (const listener of stateListeners) listener(next);
  };

  const source = new EventSource(url);
  source.onopen = (): void => setState(SseConnectionState.open);
  source.onerror = (): void =>
    setState(
      source.readyState === EventSource.CLOSED
        ? SseConnectionState.closed
        : SseConnectionState.reconnecting,
    );
  source.onmessage = (event: MessageEvent<string>): void => {
    let raw: unknown;
    try {
      raw = JSON.parse(event.data);
    } catch {
      return;
    }
    const parsed = SseEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return;
    for (const subscription of subscriptions) {
      if (matches(parsed.data, subscription.filter)) subscription.handler(parsed.data);
    }
  };

  return {
    subscribe(filter, handler): () => void {
      const subscription: Subscription = { filter, handler };
      subscriptions.add(subscription);
      return () => {
        subscriptions.delete(subscription);
      };
    },
    onStateChange(handler): () => void {
      stateListeners.add(handler);
      return () => {
        stateListeners.delete(handler);
      };
    },
    getState: (): SseConnectionState => state,
    close: (): void => {
      source.close();
      setState(SseConnectionState.closed);
    },
  };
}
