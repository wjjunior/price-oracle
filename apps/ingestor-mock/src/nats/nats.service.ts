import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  connect,
  DebugEvents,
  Events,
  headers as natsHeaders,
  type NatsConnection,
} from 'nats';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

import type { z } from 'zod';

const RECONNECT_TIME_WAIT_MS = 1_000;

export interface PublishOptions {
  readonly headers?: Readonly<Record<string, string>>;
}

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name);
  private connection: NatsConnection | null = null;
  private readonly encoder = new TextEncoder();

  constructor(@Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig) {}

  async onModuleInit(): Promise<void> {
    this.connection = await connect({
      servers: this.config.NATS_URL,
      reconnect: true,
      reconnectTimeWait: RECONNECT_TIME_WAIT_MS,
      maxReconnectAttempts: -1,
    });
    this.logger.log({ event: 'nats.connected', url: this.config.NATS_URL });
    void this.watchStatus();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connection) return;
    await this.connection.drain();
    this.connection = null;
  }

  publishContract<T>(
    schema: z.ZodType<T>,
    subject: string,
    payload: T,
    opts: PublishOptions = {},
  ): void {
    const validated = schema.parse(payload);
    this.publishBytes(subject, this.encoder.encode(JSON.stringify(validated)), opts);
  }

  publishRaw(subject: string, body: string, opts: PublishOptions = {}): void {
    this.publishBytes(subject, this.encoder.encode(body), opts);
  }

  private publishBytes(subject: string, bytes: Uint8Array, opts: PublishOptions): void {
    if (!this.connection) {
      this.logger.warn({ event: 'nats.publish-failed', reason: 'not-connected', subject });
      return;
    }
    try {
      const hdrs = opts.headers ? natsHeaders() : undefined;
      if (hdrs && opts.headers) {
        for (const [k, v] of Object.entries(opts.headers)) hdrs.set(k, v);
      }
      this.connection.publish(subject, bytes, hdrs ? { headers: hdrs } : undefined);
    } catch (err) {
      this.logger.warn({
        event: 'nats.publish-failed',
        subject,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async watchStatus(): Promise<void> {
    if (!this.connection) return;
    for await (const status of this.connection.status()) {
      if (status.type === Events.Disconnect || status.type === DebugEvents.Reconnecting) {
        this.logger.warn({ event: `nats.${status.type}`, data: status.data });
      } else if (status.type === Events.Reconnect) {
        this.logger.log({ event: 'nats.reconnected' });
      }
    }
  }
}
