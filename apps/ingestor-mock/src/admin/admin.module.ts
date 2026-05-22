import { Module } from '@nestjs/common';

import { MockModule } from '../mock/mock.module.js';

import { AdminController } from './admin.controller.js';
import { AssetParamPipe } from './asset-param.pipe.js';

@Module({
  imports: [MockModule],
  controllers: [AdminController],
  providers: [AssetParamPipe],
})
export class AdminModule {}
