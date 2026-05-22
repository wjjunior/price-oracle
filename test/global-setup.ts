import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

import type { Vitest } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    natsUrl: string;
    mongoUrl: string;
  }
}

const NATS_PORT = 4222;

let nats: StartedTestContainer;
let mongo: StartedMongoDBContainer;

export async function setup(project: Vitest): Promise<void> {
  nats = await new GenericContainer('nats:2.11-alpine')
    .withExposedPorts(NATS_PORT)
    .withWaitStrategy(Wait.forLogMessage(/Server is ready/))
    .start();
  const natsUrl = `nats://${nats.getHost()}:${nats.getMappedPort(NATS_PORT)}`;

  mongo = await new MongoDBContainer('mongo:7').start();
  const mongoUrl = mongo.getConnectionString();

  project.provide('natsUrl', natsUrl);
  project.provide('mongoUrl', mongoUrl);
}

export async function teardown(): Promise<void> {
  await nats?.stop();
  await mongo?.stop();
}
