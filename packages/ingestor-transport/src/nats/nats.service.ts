import { headers, type NatsConnection } from '@nats-io/nats-core';
import { connect } from '@nats-io/transport-node';
import { CORRELATION_HEADER } from '@price-oracle/contracts/subjects';

import type { NatsTransportOptions } from './options.js';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { z } from 'zod';

function redactUrl(url: string): string {
  return url.replace(/\/\/[^@/]+@/, '//***@');
}

export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly encoder = new TextEncoder();
  private connection: NatsConnection | undefined;

  constructor(
    private readonly options: NatsTransportOptions,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NatsService.name);
  }

  async onModuleInit(): Promise<void> {
    this.connection = await connect({ servers: this.options.natsUrl });
    this.logger.info(
      { event: 'nats.connect', url: redactUrl(this.options.natsUrl) },
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
    this.publishBytes(subject, this.encoder.encode(JSON.stringify(result.data)), correlationId);
  }

  publishRaw(subject: string, body: string, correlationId: string): void {
    this.publishBytes(subject, this.encoder.encode(body), correlationId);
  }

  private publishBytes(subject: string, bytes: Uint8Array, correlationId: string): void {
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
      connection.publish(subject, bytes, { headers: h });
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
