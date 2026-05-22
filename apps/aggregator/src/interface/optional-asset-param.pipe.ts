import { inspect } from 'node:util';

import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { AssetId } from '@price-oracle/contracts/primitives';

@Injectable()
export class OptionalAssetParamPipe implements PipeTransform<unknown, AssetId | undefined> {
  transform(value: unknown): AssetId | undefined {
    if (value === undefined) {
      return undefined;
    }
    const parsed = AssetId.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_asset',
        message: `unknown asset: ${inspect(value)}`,
        allowed: AssetId.options,
      });
    }
    return parsed.data;
  }
}
