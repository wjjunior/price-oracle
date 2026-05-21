import { Module } from '@nestjs/common';

import { NatsModule } from '../nats/nats.module.js';

import { CoinbaseService } from './coinbase.service.js';

@Module({
  imports: [NatsModule],
  providers: [CoinbaseService],
})
export class CoinbaseModule {}
