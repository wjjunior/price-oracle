import { Module } from '@nestjs/common';
import { NatsService } from '@price-oracle/ingestor-transport/nats';
import { PinoLogger } from 'nestjs-pino';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

@Module({
  providers: [
    {
      provide: NatsService,
      useFactory: (config: IngestorConfig, logger: PinoLogger): NatsService =>
        new NatsService({ natsUrl: config.natsUrl }, logger),
      inject: [INGESTOR_CONFIG, PinoLogger],
    },
  ],
  exports: [NatsService],
})
export class NatsModule {}
