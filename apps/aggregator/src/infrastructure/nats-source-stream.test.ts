import { CORRELATION_HEADER, TICKS_SUBSCRIPTION_PATTERN } from '@price-oracle/contracts/subjects';
import { describe, expect, it, vi } from 'vitest';

import { NatsSourceStream } from './nats-source-stream.js';

import type { Tick } from '../domain/types.js';
import type { NatsConnection } from '@nats-io/nats-core';
import type { Logger } from 'pino';

type Callback = (err: Error | null, msg: unknown) => void;

const fakeNats = () => {
  let callback: Callback | undefined;
  const unsubscribe = vi.fn();
  const subscribedTo: string[] = [];
  const connection = {
    subscribe(subject: string, opts: { callback: Callback }) {
      subscribedTo.push(subject);
      callback = opts.callback;
      return { unsubscribe };
    },
  } as unknown as NatsConnection;
  return {
    connection,
    unsubscribe,
    subscribedTo,
    emit: (msg: unknown) => callback?.(null, msg),
    emitError: (err: Error) => callback?.(err, undefined),
  };
};

const natsMsg = (payload: unknown, correlationId?: string) => ({
  data: new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload)),
  headers:
    correlationId === undefined
      ? undefined
      : { get: (key: string) => (key === CORRELATION_HEADER ? correlationId : '') },
});

const validTick: Tick = { asset: 'btc', source: 'binance', price: 65_000, receivedAt: 1_747_000_000_000 };

const fakeLogger = () => ({ warn: vi.fn() }) as unknown as Logger;

describe('NatsSourceStream', () => {
  it('should subscribe to the ticks wildcard pattern', () => {
    const nats = fakeNats();
    new NatsSourceStream(nats.connection, fakeLogger()).subscribe(() => {});
    expect(nats.subscribedTo).toEqual([TICKS_SUBSCRIPTION_PATTERN]);
  });

  it('should deliver a parsed tick with its correlation id', () => {
    const nats = fakeNats();
    const onTick = vi.fn();
    new NatsSourceStream(nats.connection, fakeLogger()).subscribe(onTick);

    nats.emit(natsMsg(validTick, 'corr-42'));

    expect(onTick).toHaveBeenCalledWith(validTick, 'corr-42');
  });

  it('should drop a payload that fails Tick validation without calling back', () => {
    const nats = fakeNats();
    const onTick = vi.fn();
    const logger = fakeLogger();
    new NatsSourceStream(nats.connection, logger).subscribe(onTick);

    nats.emit(natsMsg({ asset: 'btc', source: 'binance', price: -1, receivedAt: 1 }));

    expect(onTick).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should drop a non-JSON payload without throwing', () => {
    const nats = fakeNats();
    const onTick = vi.fn();
    const logger = fakeLogger();
    new NatsSourceStream(nats.connection, logger).subscribe(onTick);

    expect(() => nats.emit(natsMsg('not-json{'))).not.toThrow();
    expect(onTick).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should drop a message that is missing the correlation header', () => {
    const nats = fakeNats();
    const onTick = vi.fn();
    const logger = fakeLogger();
    new NatsSourceStream(nats.connection, logger).subscribe(onTick);

    nats.emit(natsMsg(validTick));

    expect(onTick).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should ignore a subscription error without calling back', () => {
    const nats = fakeNats();
    const onTick = vi.fn();
    const logger = fakeLogger();
    new NatsSourceStream(nats.connection, logger).subscribe(onTick);

    expect(() => nats.emitError(new Error('boom'))).not.toThrow();
    expect(onTick).not.toHaveBeenCalled();
  });

  it('should unsubscribe the NATS subscription when the returned function is called', () => {
    const nats = fakeNats();
    const unsubscribe = new NatsSourceStream(nats.connection, fakeLogger()).subscribe(() => {});

    unsubscribe();

    expect(nats.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
