import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { NatsService } from './nats.service.js';

import type { NatsTransportOptions } from './options.js';
import type { PinoLogger } from 'nestjs-pino';

const options: NatsTransportOptions = { natsUrl: 'nats://localhost:4222' };

const makeLogger = (): PinoLogger =>
  ({ setContext: vi.fn(), info: vi.fn(), warn: vi.fn() }) as unknown as PinoLogger;

describe('NatsService', () => {
  it('should refuse to publish a payload that fails contract validation', () => {
    const logger = makeLogger();
    const service = new NatsService(options, logger);
    const schema = z.object({ price: z.number() });
    const invalid = { price: 'not-a-number' } as unknown as z.input<typeof schema>;

    service.publishContract(schema, 'ticks.btc.mock', invalid, 'cid');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'nats.publish.invalid', subject: 'ticks.btc.mock' }),
      expect.any(String),
    );
  });

  it('should skip publishing when the connection is not ready', () => {
    const logger = makeLogger();
    const service = new NatsService(options, logger);

    service.publishRaw('ticks.btc.mock', '{}', 'cid');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'nats.publish.skipped', subject: 'ticks.btc.mock' }),
      expect.any(String),
    );
  });
});
