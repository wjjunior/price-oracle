import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { startStack, type Stack } from '../helpers/harness.js';
import { pollUntil } from '../helpers/poll.js';

import type { AssetId } from '@price-oracle/contracts/primitives';
import type { GetSnapshotResponse } from '@price-oracle/contracts/rest';

const BTC = 'btc' satisfies AssetId;
const WARMUP_BUDGET_MS = 10_000;

let stack: Stack;

const getSnapshot = async (baseUrl: string, asset: AssetId): Promise<GetSnapshotResponse> => {
  const response = await fetch(`${baseUrl}/api/snapshot?asset=${asset}`);
  expect(response.ok).toBe(true);
  return (await response.json()) as GetSnapshotResponse;
};

beforeAll(async () => {
  stack = await startStack({ natsUrl: inject('natsUrl'), mongoUrl: inject('mongoUrl') });
}, 120_000);

afterAll(async () => {
  await stack?.close();
}, 60_000);

describe('restart recovery', () => {
  it('should serve the last-known aggregate from persistence after an aggregator restart', async () => {
    const warm = await pollUntil(
      () => getSnapshot(stack.aggUrl, BTC),
      (snapshot) => snapshot.aggregate !== null,
      { timeoutMs: WARMUP_BUDGET_MS },
    );
    const before = warm.aggregate;
    expect(before).not.toBeNull();

    // Stop the only tick source so no new aggregate is computed after restart,
    // then restart the aggregator with fresh in-memory state against the same Mongo.
    await stack.stopMock();
    await stack.restartAggregator();

    const after = await getSnapshot(stack.aggUrl, BTC);
    expect(after.aggregate).not.toBeNull();
    expect(after.aggregate?.price).toBe(before?.price);
    expect(after.aggregate?.computedAt).toBe(before?.computedAt);
    expect(after.aggregate?.confidence).toBe(before?.confidence);
  });
});
