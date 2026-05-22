import { Inject, Injectable } from '@nestjs/common';

import { Orchestrator } from '../application/orchestrator.js';

import { MONGO_CLIENT, NATS_CONNECTION, LOGGER } from './tokens.js';

import type { NatsConnection } from '@nats-io/nats-core';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { MongoClient } from 'mongodb';
import type { Logger } from 'pino';

@Injectable()
export class LifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(Orchestrator) private readonly orchestrator: Orchestrator,
    @Inject(NATS_CONNECTION) private readonly nats: NatsConnection,
    @Inject(MONGO_CLIENT) private readonly mongo: MongoClient,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.orchestrator.start();
  }

  async onApplicationShutdown(): Promise<void> {
    this.orchestrator.stop();
    await this.mongo.close();
    await this.nats.drain();
    this.logger.info({ event: 'aggregator.shutdown' }, 'Aggregator shut down');
  }
}
