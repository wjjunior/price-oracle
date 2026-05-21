import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { type AssetId, type Millis } from '@price-oracle/contracts/primitives';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';
import { ChaosMode, type ChaosState } from '../mock/chaos-mode.js';
import { ChaosStateService } from '../mock/chaos-state.service.js';
import { TickGeneratorService } from '../mock/tick-generator.service.js';

import { AssetParamPipe } from './asset-param.pipe.js';

interface AssetStateResponse {
  readonly asset: AssetId;
  readonly mode: ChaosState['mode'];
  readonly since: Millis;
  readonly frozenPrice?: number;
}

const anchorFor = (asset: AssetId, cfg: IngestorConfig): number =>
  asset === 'btc' ? cfg.btcAnchorUsd : cfg.ethAnchorUsd;

const describe = (asset: AssetId, state: ChaosState): AssetStateResponse => {
  if (state.mode === ChaosMode.STALE) {
    return { asset, mode: state.mode, since: state.since, frozenPrice: state.frozenPrice };
  }
  return { asset, mode: state.mode, since: state.since };
};

@Controller('admin')
export class AdminController {
  constructor(
    @Inject(ChaosStateService) private readonly chaos: ChaosStateService,
    @Inject(TickGeneratorService) private readonly generator: TickGeneratorService,
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
  ) {}

  @Post(':asset/disconnect')
  @HttpCode(HttpStatus.OK)
  disconnect(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    this.chaos.setDisconnected(asset, Date.now());
    return describe(asset, this.chaos.get(asset));
  }

  @Post(':asset/stale')
  @HttpCode(HttpStatus.OK)
  stale(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    const last = this.generator.lastPublished(asset);
    const now = Date.now();
    if (last) {
      this.chaos.setStale(asset, now, last.price, last.sourceTimestamp);
    } else {
      this.chaos.setStale(asset, now, anchorFor(asset, this.config), now);
    }
    return describe(asset, this.chaos.get(asset));
  }

  @Post(':asset/malformed')
  @HttpCode(HttpStatus.OK)
  malformed(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    this.chaos.setMalformed(asset, Date.now());
    return describe(asset, this.chaos.get(asset));
  }

  @Post(':asset/reset')
  @HttpCode(HttpStatus.OK)
  reset(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    this.chaos.reset(asset, Date.now());
    return describe(asset, this.chaos.get(asset));
  }

  @Post('reset-all')
  @HttpCode(HttpStatus.OK)
  resetAll(): { states: AssetStateResponse[] } {
    this.chaos.resetAll(Date.now());
    return this.status();
  }

  @Get('status')
  status(): { states: AssetStateResponse[] } {
    return { states: this.chaos.snapshot().map(({ asset, state }) => describe(asset, state)) };
  }
}
