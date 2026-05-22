import { headers, type NatsConnection } from '@nats-io/nats-core';
import { CORRELATION_HEADER, aggregatesSubject } from '@price-oracle/contracts/subjects';


import type { PublishPort } from '../domain/ports/publish.port.js';
import type { AggregatePrice } from '../domain/types.js';
import type { Logger } from 'pino';

export class NatsPublisher implements PublishPort {
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly connection: NatsConnection,
    private readonly logger: Logger,
  ) {}

  async publishAggregate(aggregate: AggregatePrice, correlationId: string): Promise<void> {
    const subject = aggregatesSubject(aggregate.asset);
    const messageHeaders = headers();
    messageHeaders.append(CORRELATION_HEADER, correlationId);
    try {
      this.connection.publish(subject, this.encoder.encode(JSON.stringify(aggregate)), {
        headers: messageHeaders,
      });
    } catch (err) {
      this.logger.warn(
        {
          event: 'publisher.failed',
          subject,
          correlationId,
          error: err instanceof Error ? err.message : String(err),
        },
        'Aggregate publish failed',
      );
    }
  }
}
