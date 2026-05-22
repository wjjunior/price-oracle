import { headers, type NatsConnection } from '@nats-io/nats-core';
import { connect } from '@nats-io/transport-node';
import { Inject, Injectable } from '@nestjs/common';
import { CORRELATION_HEADER } from '@price-oracle/contracts/subjects';
import { PinoLogger } from 'nestjs-pino';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';

function redactUrl(url: string): string {
  return url.replace(/\/\/[^@/]+@/, '//***@');
}

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly encoder = new TextEncoder();
  private connection: NatsConnection | undefined;

  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NatsService.name);
  }

  async onModuleInit(): Promise<void> {
    this.connection = await connect({ servers: this.config.natsUrl });
    this.logger.info(
      { event: 'nats.connect', url: redactUrl(this.config.natsUrl) },
      'NATS connected',
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connection) return;
    await this.connection.drain();
    this.connection = undefined;
  }

  publishContract<S extends z.ZodTypeAny>(
    schema: S,
    subject: string,
    payload: z.input<S>,
    correlationId: string,
  ): void {
    const result = schema.safeParse(payload);
    if (!result.success) {
      this.logger.warn(
        { event: 'nats.publish.invalid', subject, correlationId, issues: result.error.issues },
        'Refusing to publish a payload that failed contract validation',
      );
      return;
    }
    const connection = this.connection;
    if (!connection) {
      this.logger.warn(
        { event: 'nats.publish.skipped', subject, correlationId },
        'NATS connection not ready',
      );
      return;
    }
    const h = headers();
    h.append(CORRELATION_HEADER, correlationId);
    try {
      connection.publish(subject, this.encoder.encode(JSON.stringify(result.data)), { headers: h });
    } catch (err) {
      this.logger.warn(
        {
          event: 'nats.publish.failed',
          subject,
          correlationId,
          error: err instanceof Error ? err.message : String(err),
        },
        'NATS publish failed',
      );
    }
  }
}
