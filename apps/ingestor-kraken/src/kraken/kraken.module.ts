import { Module } from '@nestjs/common';

import { NatsModule } from '../nats/nats.module.js';

import { KrakenService } from './kraken.service.js';

@Module({
  imports: [NatsModule],
  providers: [KrakenService],
})
export class KrakenModule {}
