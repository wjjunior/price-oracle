import { connect } from '@nats-io/transport-node';
import { AGGREGATES_SUBSCRIPTION_PATTERN } from '@price-oracle/contracts/subjects';

import type { NatsConnection, Subscription } from '@nats-io/nats-core';
import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';

const DEFAULT_INTERVAL_MS = 100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeoutMs: number; intervalMs?: number },
): Promise<T> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const deadline = Date.now() + options.timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await fn();
    if (predicate(last)) return last;
    await sleep(intervalMs);
  }
  throw new Error(`pollUntil timed out after ${options.timeoutMs}ms (last value: ${JSON.stringify(last)})`);
}

export type AggregateTap = {
  latest: (asset: AssetId) => AggregatePrice | undefined;
  count: (asset: AssetId) => number;
  countSince: (asset: AssetId, mark: number) => number;
  close: () => Promise<void>;
};

export async function createAggregateTap(natsUrl: string): Promise<AggregateTap> {
  const connection: NatsConnection = await connect({ servers: natsUrl });
  const latestByAsset = new Map<AssetId, AggregatePrice>();
  const countByAsset = new Map<AssetId, number>();

  const subscription: Subscription = connection.subscribe(AGGREGATES_SUBSCRIPTION_PATTERN, {
    callback: (_err, msg) => {
      const aggregate = msg.json<AggregatePrice>();
      latestByAsset.set(aggregate.asset, aggregate);
      countByAsset.set(aggregate.asset, (countByAsset.get(aggregate.asset) ?? 0) + 1);
    },
  });

  const count = (asset: AssetId): number => countByAsset.get(asset) ?? 0;

  return {
    latest: (asset) => latestByAsset.get(asset),
    count,
    countSince: (asset, mark) => count(asset) - mark,
    close: async (): Promise<void> => {
      subscription.unsubscribe();
      await connection.drain();
    },
  };
}
