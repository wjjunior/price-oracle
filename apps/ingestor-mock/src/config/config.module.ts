import { Global, Module, type DynamicModule } from '@nestjs/common';

import { INGESTOR_CONFIG, type IngestorConfig } from './env.schema.js';

@Global()
@Module({})
export class ConfigModule {
  static register(config: IngestorConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: INGESTOR_CONFIG, useValue: config }],
      exports: [INGESTOR_CONFIG],
    };
  }
}
