import { Module } from '@nestjs/common';

import { NatsModule } from '../nats/nats.module.js';

import { ChaosStateService } from './chaos-state.service.js';
import { TickGeneratorService } from './tick-generator.service.js';

@Module({
  imports: [NatsModule],
  providers: [ChaosStateService, TickGeneratorService],
  exports: [ChaosStateService, TickGeneratorService],
})
export class MockModule {}
