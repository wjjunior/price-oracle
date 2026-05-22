import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { mongoUrlForTests, startStack, type Stack } from '../helpers/harness.js';
import { pollUntil } from '../helpers/poll.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';
import type { GetSnapshotResponse } from '@price-oracle/contracts/rest';

const BTC = 'btc' satisfies AssetId;
const SNAPSHOTS_COLLECTION = 'aggregate_snapshots';
const WARMUP_BUDGET_MS = 10_000;
const PERSIST_BUDGET_MS = 5_000;

let stack: Stack;
let mongo: MongoClient;

const getSnapshot = async (baseUrl: string, asset: AssetId): Promise<GetSnapshotResponse> => {
  const response = await fetch(`${baseUrl}/api/snapshot?asset=${asset}`);
  expect(response.ok).toBe(true);
  return (await response.json()) as GetSnapshotResponse;
};

const readPersisted = async (asset: AssetId): Promise<AggregatePrice | null> => {
  const doc = await mongo
    .db()
    .collection(SNAPSHOTS_COLLECTION)
    .findOne<AggregatePrice>({ asset }, { projection: { _id: 0 } });
  return doc ?? null;
};

beforeAll(async () => {
  stack = await startStack({ natsUrl: inject('natsUrl'), mongoUrl: inject('mongoUrl') });
  mongo = await MongoClient.connect(mongoUrlForTests(inject('mongoUrl')));
}, 120_000);

afterAll(async () => {
  await mongo?.close();
  await stack?.close();
}, 60_000);

describe('restart recovery', () => {
  it('should serve the last-known aggregate from persistence after an aggregator restart', async () => {
    await pollUntil(
      () => getSnapshot(stack.aggUrl, BTC),
      (snapshot) => snapshot.aggregate !== null,
      { timeoutMs: WARMUP_BUDGET_MS },
    );

    await stack.stopMock();
    await stack.stopAggregator();

    const persisted = await pollUntil(
      () => readPersisted(BTC),
      (doc): doc is AggregatePrice => doc !== null,
      { timeoutMs: PERSIST_BUDGET_MS },
    );

    await stack.startAggregator();

    const recovered = await getSnapshot(stack.aggUrl, BTC);
    expect(recovered.aggregate).toEqual(persisted);
  });
});
