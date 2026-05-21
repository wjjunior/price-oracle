import { Global, Module } from '@nestjs/common';

import { INGESTOR_CONFIG, loadIngestorConfig } from './env.schema.js';

@Global()
@Module({
  providers: [
    {
      provide: INGESTOR_CONFIG,
      useFactory: () => loadIngestorConfig(),
    },
  ],
  exports: [INGESTOR_CONFIG],
})
export class ConfigModule {}
