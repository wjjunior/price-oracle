import { Module, type DynamicModule } from '@nestjs/common';

import { MockModule } from '../mock/mock.module.js';

import { AdminController } from './admin.controller.js';
import { AssetParamPipe } from './asset-param.pipe.js';

@Module({})
export class AdminModule {
  static register(enabled: boolean): DynamicModule {
    if (!enabled) return { module: AdminModule };
    return {
      module: AdminModule,
      imports: [MockModule],
      controllers: [AdminController],
      providers: [AssetParamPipe],
    };
  }
}
