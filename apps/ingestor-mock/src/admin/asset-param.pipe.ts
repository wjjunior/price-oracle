import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { AssetId } from '@price-oracle/contracts/primitives';

@Injectable()
export class AssetParamPipe implements PipeTransform<string, AssetId> {
  transform(value: string): AssetId {
    const parsed = AssetId.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_asset',
        message: `unknown asset: ${value}`,
        allowed: AssetId.options,
      });
    }
    return parsed.data;
  }
}
