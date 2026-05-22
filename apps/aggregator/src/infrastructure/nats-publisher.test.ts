import { CORRELATION_HEADER } from '@price-oracle/contracts/subjects';
import { describe, expect, it, vi } from 'vitest';

import { NatsPublisher } from './nats-publisher.js';

import type { AggregatePrice } from '../domain/types.js';
import type { NatsConnection } from '@nats-io/nats-core';
import type { Logger } from 'pino';

const fakeNats = () => {
  const publish = vi.fn();
  const connection = { publish } as unknown as NatsConnection;
  return { connection, publish };
};

const fakeLogger = () => ({ warn: vi.fn() }) as unknown as Logger;

const aggregate: AggregatePrice = {
  asset: 'btc',
  price: 65_000,
  confidence: 0.95,
  contributingSources: ['binance', 'coinbase'],
  computedAt: 1_747_000_000_000,
};

const decoder = new TextDecoder();

describe('NatsPublisher', () => {
  it('should publish to the per-asset aggregates subject', async () => {
    const nats = fakeNats();
    await new NatsPublisher(nats.connection, fakeLogger()).publishAggregate(aggregate, 'corr-1');
    expect(nats.publish.mock.calls[0]?.[0]).toBe('aggregates.btc');

    await new NatsPublisher(nats.connection, fakeLogger()).publishAggregate(
      { ...aggregate, asset: 'eth' },
      'corr-1',
    );
    expect(nats.publish.mock.calls[1]?.[0]).toBe('aggregates.eth');
  });

  it('should include the correlation id in the message header', async () => {
    const nats = fakeNats();
    await new NatsPublisher(nats.connection, fakeLogger()).publishAggregate(aggregate, 'corr-42');
    const options = nats.publish.mock.calls[0]?.[2] as { headers: { get(k: string): string } };
    expect(options.headers.get(CORRELATION_HEADER)).toBe('corr-42');
  });

  it('should JSON-encode the aggregate payload', async () => {
    const nats = fakeNats();
    await new NatsPublisher(nats.connection, fakeLogger()).publishAggregate(aggregate, 'corr-1');
    const data = nats.publish.mock.calls[0]?.[1] as Uint8Array;
    expect(JSON.parse(decoder.decode(data))).toEqual(aggregate);
  });

  it('should not throw and should warn when the publish fails', async () => {
    const nats = fakeNats();
    nats.publish.mockImplementation(() => {
      throw new Error('NATS disconnected');
    });
    const logger = fakeLogger();

    await expect(
      new NatsPublisher(nats.connection, logger).publishAggregate(aggregate, 'corr-1'),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr-1' }),
      expect.any(String),
    );
  });
});
