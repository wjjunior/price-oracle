import { describe, expect, it, vi } from 'vitest';

import { Orchestrator } from '../application/orchestrator.js';

import { StreamController } from './stream.controller.js';

import type { MessageEvent } from '@nestjs/common';
import type { SseEnvelope } from '@price-oracle/contracts/sse';

const envelope: SseEnvelope = {
  type: 'breaker-state',
  asset: 'btc',
  data: 'OPEN',
  correlationId: '11111111-1111-4111-8111-111111111111',
};

type OnEvent = (envelope: SseEnvelope) => void;

const fakeOrchestrator = (): { orchestrator: Orchestrator; emit: OnEvent; offCalls: number } => {
  let listener: OnEvent | null = null;
  let offCalls = 0;
  const orchestrator = {
    onEvent: (l: OnEvent): (() => void) => {
      listener = l;
      return (): void => {
        offCalls += 1;
      };
    },
  } as unknown as Orchestrator;
  return {
    orchestrator,
    emit: (e: SseEnvelope) => listener?.(e),
    get offCalls(): number {
      return offCalls;
    },
  };
};

describe('StreamController', () => {
  it('should push an SSE MessageEvent when the orchestrator emits an envelope', () => {
    const fake = fakeOrchestrator();
    const controller = new StreamController(fake.orchestrator);
    const received: MessageEvent[] = [];

    const subscription = controller.stream().subscribe((event) => received.push(event));
    fake.emit(envelope);
    subscription.unsubscribe();

    expect(received).toHaveLength(1);
    expect(received[0]?.data).toEqual(envelope);
  });

  it('should unsubscribe the orchestrator listener on teardown', () => {
    const fake = fakeOrchestrator();
    const controller = new StreamController(fake.orchestrator);

    const subscription = controller.stream().subscribe(() => undefined);
    expect(fake.offCalls).toBe(0);
    subscription.unsubscribe();

    expect(fake.offCalls).toBe(1);
  });

  it('should emit a heartbeat MessageEvent on the interval', () => {
    vi.useFakeTimers();
    try {
      const fake = fakeOrchestrator();
      const controller = new StreamController(fake.orchestrator);
      const received: MessageEvent[] = [];

      const subscription = controller.stream().subscribe((event) => received.push(event));
      vi.advanceTimersByTime(15_000);
      subscription.unsubscribe();

      expect(received.some((e) => e.type === 'heartbeat')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
