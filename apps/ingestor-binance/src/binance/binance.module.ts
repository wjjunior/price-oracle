import { Module } from '@nestjs/common';

import { NatsModule } from '../nats/nats.module.js';

import { BinanceService } from './binance.service.js';

@Module({
  imports: [NatsModule],
  providers: [BinanceService],
})
export class BinanceModule {}
