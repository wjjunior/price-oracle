/**
 * @file NestJS pipe for an *optional* `asset` query parameter.
 *
 * **The "list across all assets" case.** `/api/audit` accepts an
 * optional `asset=...` filter; absent means "every asset". This
 * pipe returns `undefined` when the caller did not supply the
 * parameter, and a validated `AssetId` when they did.
 *
 * **Why a separate pipe instead of making `AssetParamPipe`
 * `T | undefined`.** The required and optional cases have different
 * downstream contracts: the required pipe should reject `undefined`
 * with a 400, the optional pipe must tolerate it. Splitting keeps
 * both callers honest at compile time — `@Query('asset',
 * AssetParamPipe)` resolves to `AssetId`, never `AssetId |
 * undefined`, so the snapshot/diagnose controllers cannot
 * accidentally forget the asset.
 *
 * **Same error shape as `AssetParamPipe`** for the present-but-invalid
 * case — `{ error: 'invalid_asset', ... }`. The dashboard error
 * toast renders both pipes' failures uniformly.
 *
 * Cross-references:
 *  - `asset-param.pipe.ts`: the required-asset sibling.
 *  - `audit.controller.ts`: the only consumer of this pipe.
 *  - `@price-oracle/contracts/primitives::AssetId`: the enum.
 */
import { inspect } from 'node:util';

import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { AssetId } from '@price-oracle/contracts/primitives';

@Injectable()
export class OptionalAssetParamPipe implements PipeTransform<unknown, AssetId | undefined> {
  /**
   * - Missing parameter → return `undefined` (the controller treats
   *   this as "no filter").
   * - Present and valid → return the typed `AssetId`.
   * - Present and invalid → throw 400 with the structured body.
   */
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
