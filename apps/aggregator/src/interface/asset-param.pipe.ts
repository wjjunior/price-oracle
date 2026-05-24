/**
 * @file NestJS pipe that parses a required `asset` query parameter
 * into a typed `AssetId`.
 *
 * **Boundary validation (CLAUDE.md rule 5).** HTTP query strings are
 * `unknown` from the runtime's perspective. This pipe runs `AssetId`
 * (the closed Zod enum from `@price-oracle/contracts/primitives`) over
 * the incoming value and, on success, hands the downstream handler
 * a value of the precise enum type — so the rest of the controller
 * can `switch (asset)` exhaustively without re-validating.
 *
 * **Why a NestJS pipe rather than parsing inside the handler.**
 * Pipes are the canonical NestJS extension point for parameter
 * validation; the failure path produces a clean HTTP 400 with a
 * structured body. Two callers in this codebase
 * (`snapshot.controller.ts`, `diagnose.controller.ts`) use this pipe,
 * so centralizing it removes duplication and ensures consistent
 * error shape.
 *
 * **Error body shape.** `{ error: 'invalid_asset', message: '...',
 * allowed: AssetId.options }` — the `allowed` array lets the
 * dashboard render a "valid values are: btc, eth" hint without
 * having to know the enum out-of-band.
 *
 * **`inspect(value)` instead of `String(value)`.** `inspect` renders
 * objects with their structure intact (e.g. `{ asset: 'foo' }`
 * instead of `[object Object]`) so the error message is actionable
 * when something other than a string slips through.
 *
 * Cross-references:
 *  - `optional-asset-param.pipe.ts`: the sibling pipe for
 *    `asset?: AssetId | undefined` query parameters.
 *  - `audit.controller.ts`: uses `OptionalAssetParamPipe` since
 *    `/api/audit` can list across all assets.
 *  - `snapshot.controller.ts`, `diagnose.controller.ts`: use this
 *    required-asset pipe.
 *  - `@price-oracle/contracts/primitives::AssetId`: the source of truth.
 */
import { inspect } from 'node:util';

import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { AssetId } from '@price-oracle/contracts/primitives';

@Injectable()
export class AssetParamPipe implements PipeTransform<unknown, AssetId> {
  /**
   * Validate `value` against the `AssetId` Zod enum. On success,
   * narrow the type to `AssetId`. On failure, throw `BadRequestException`
   * with a structured body that the dashboard's error toast can
   * render directly.
   */
  transform(value: unknown): AssetId {
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
