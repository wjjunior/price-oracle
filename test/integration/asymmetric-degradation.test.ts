import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { startStack, type Stack } from '../helpers/harness.js';
import { createAggregateTap, pollUntil, type AggregateTap } from '../helpers/poll.js';

import type { BreakerStateChanged } from '@price-oracle/contracts/events';
import type { AssetId, BreakerState } from '@price-oracle/contracts/primitives';
import type { GetAuditResponse, GetSnapshotResponse } from '@price-oracle/contracts/rest';

const BTC = 'btc' satisfies AssetId;
const ETH = 'eth' satisfies AssetId;

const HEALTHY_CONFIDENCE = 0.9;
const WARMUP_BUDGET_MS = 10_000;
const BREAKER_OPEN_BUDGET_MS = 4_000;
const RECOVERY_BUDGET_MS = 8_000;
const SILENCE_OBSERVATION_MS = 1_000;

const BREAKER = {
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
  CLOSED: 'CLOSED',
} as const satisfies Record<BreakerState, BreakerState>;

const BREAKER_STATE_CHANGED = 'BreakerStateChanged';

let stack: Stack;
let tap: AggregateTap;

const getSnapshot = async (baseUrl: string, asset: AssetId): Promise<GetSnapshotResponse> => {
  const response = await fetch(`${baseUrl}/api/snapshot?asset=${asset}`);
  expect(response.ok).toBe(true);
  return (await response.json()) as GetSnapshotResponse;
};

const getAudit = async (baseUrl: string, asset: AssetId): Promise<GetAuditResponse> => {
  const response = await fetch(`${baseUrl}/api/audit?asset=${asset}&limit=100`);
  expect(response.ok).toBe(true);
  return (await response.json()) as GetAuditResponse;
};

const breakerTransitions = (audit: GetAuditResponse, asset: AssetId): BreakerStateChanged[] =>
  audit.events.filter(
    (event): event is BreakerStateChanged =>
      event.type === BREAKER_STATE_CHANGED && event.asset === asset,
  );

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  stack = await startStack({ natsUrl: inject('natsUrl'), mongoUrl: inject('mongoUrl') });
  tap = await createAggregateTap(inject('natsUrl'));
}, 120_000);

afterAll(async () => {
  await tap?.close();
  await stack?.close();
}, 60_000);

describe('asymmetric degradation', () => {
  // The ticket mentions `stale`, but with a single mock source `stale` keeps the source fresh,
  // so confidence stays high and the breaker never trips. `disconnect` stops eth ticks, the
  // source ages past the stale threshold, confidence collapses, and the breaker opens.
  it('should open and recover ETH while BTC keeps publishing unaffected', async () => {
    const warm = await pollUntil(
      async () => ({
        btc: await getSnapshot(stack.aggUrl, BTC),
        eth: await getSnapshot(stack.aggUrl, ETH),
      }),
      ({ btc, eth }) =>
        (btc.aggregate?.confidence ?? 0) >= HEALTHY_CONFIDENCE &&
        (eth.aggregate?.confidence ?? 0) >= HEALTHY_CONFIDENCE,
      { timeoutMs: WARMUP_BUDGET_MS },
    );
    expect(warm.btc.aggregate?.confidence).toBeGreaterThanOrEqual(HEALTHY_CONFIDENCE);
    expect(warm.eth.aggregate?.confidence).toBeGreaterThanOrEqual(HEALTHY_CONFIDENCE);

    const disconnect = await fetch(`${stack.mockUrl}/admin/eth/disconnect`, { method: 'POST' });
    expect(disconnect.status).toBe(200);

    const opened = await pollUntil(
      () => getSnapshot(stack.aggUrl, ETH),
      (snapshot) => snapshot.breaker === BREAKER.OPEN,
      { timeoutMs: BREAKER_OPEN_BUDGET_MS },
    );
    expect(opened.breaker).toBe(BREAKER.OPEN);

    const auditAfterOpen = await getAudit(stack.aggUrl, ETH);
    expect(
      breakerTransitions(auditAfterOpen, ETH).some((event) => event.to === BREAKER.OPEN),
    ).toBe(true);

    const ethCountAtOpen = tap.count(ETH);
    const btcCountAtOpen = tap.count(BTC);
    await sleep(SILENCE_OBSERVATION_MS);
    expect(tap.countSince(ETH, ethCountAtOpen)).toBe(0);
    expect(tap.countSince(BTC, btcCountAtOpen)).toBeGreaterThan(0);

    const btcSnapshot = await getSnapshot(stack.aggUrl, BTC);
    expect(btcSnapshot.breaker).toBe(BREAKER.CLOSED);
    expect(btcSnapshot.aggregate?.confidence).toBeGreaterThanOrEqual(HEALTHY_CONFIDENCE);

    const reset = await fetch(`${stack.mockUrl}/admin/eth/reset`, { method: 'POST' });
    expect(reset.status).toBe(200);

    await pollUntil(
      () => getAudit(stack.aggUrl, ETH),
      (audit) => breakerTransitions(audit, ETH).some((event) => event.to === BREAKER.CLOSED),
      { timeoutMs: RECOVERY_BUDGET_MS },
    );

    const finalAudit = await getAudit(stack.aggUrl, ETH);
    const chronological = breakerTransitions(finalAudit, ETH)
      .slice()
      .reverse()
      .map((event) => event.to);
    const openIndex = chronological.indexOf(BREAKER.OPEN);
    const halfOpenIndex = chronological.indexOf(BREAKER.HALF_OPEN, openIndex + 1);
    const closedIndex = chronological.indexOf(BREAKER.CLOSED, halfOpenIndex + 1);
    expect(openIndex).toBeGreaterThanOrEqual(0);
    expect(halfOpenIndex).toBeGreaterThan(openIndex);
    expect(closedIndex).toBeGreaterThan(halfOpenIndex);
  });
});
