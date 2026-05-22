import { TickSchema } from '@price-oracle/contracts/events';
import { CORRELATION_HEADER, TICKS_SUBSCRIPTION_PATTERN } from '@price-oracle/contracts/subjects';


import type { SourceStreamPort, Unsubscribe } from '../domain/ports/source-stream.port.js';
import type { Tick } from '../domain/types.js';
import type { NatsConnection } from '@nats-io/nats-core';
import type { Logger } from 'pino';

const MAX_LOGGED_PAYLOAD = 256;

export class NatsSourceStream implements SourceStreamPort {
  private readonly decoder = new TextDecoder();

  constructor(
    private readonly connection: NatsConnection,
    private readonly logger: Logger,
  ) {}

  subscribe(onTick: (tick: Tick, correlationId: string) => void): Unsubscribe {
    const subscription = this.connection.subscribe(TICKS_SUBSCRIPTION_PATTERN, {
      callback: (err, msg) => {
        if (err !== null) {
          this.logger.warn(
            { event: 'source-stream.error', error: err.message },
            'NATS subscription error',
          );
          return;
        }
        const tick = this.parseTick(this.decoder.decode(msg.data));
        if (tick === null) return;
        const correlationId = msg.headers?.get(CORRELATION_HEADER);
        if (!correlationId) {
          this.logger.warn(
            { event: 'source-stream.missing-correlation', subject: msg.subject },
            'Dropping tick without a correlation id',
          );
          return;
        }
        onTick(tick, correlationId);
      },
    });
    return () => {
      subscription.unsubscribe();
    };
  }

  private parseTick(raw: string): Tick | null {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.logger.warn(
        { event: 'source-stream.malformed', payload: raw.slice(0, MAX_LOGGED_PAYLOAD) },
        'Dropping non-JSON tick payload',
      );
      return null;
    }
    const result = TickSchema.safeParse(json);
    if (!result.success) {
      this.logger.warn(
        {
          event: 'source-stream.invalid',
          payload: raw.slice(0, MAX_LOGGED_PAYLOAD),
          issues: result.error.issues,
        },
        'Dropping tick that failed contract validation',
      );
      return null;
    }
    return result.data;
  }
}
