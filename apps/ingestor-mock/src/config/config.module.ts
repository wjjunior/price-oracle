import { Global, Module } from '@nestjs/common';

import { INGESTOR_CONFIG, loadConfig } from './env.schema.js';

@Global()
@Module({
  providers: [
    {
      provide: INGESTOR_CONFIG,
      useFactory: () => loadConfig(process.env),
    },
  ],
  exports: [INGESTOR_CONFIG],
})
export class ConfigModule {}
