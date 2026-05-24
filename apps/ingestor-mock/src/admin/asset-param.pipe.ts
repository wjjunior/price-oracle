/**
 * @file Nest pipe that turns the `:asset` route parameter into a
 * validated `AssetId`.
 *
 * **Why a pipe and not an inline check.** The asset route segment
 * appears on every chaos endpoint (`/admin/:asset/disconnect`,
 * `/admin/:asset/stale`, `/admin/:asset/malformed`,
 * `/admin/:asset/reset`). Inlining `AssetId.safeParse(...)` at the
 * top of each handler would duplicate the validation and the error
 * shape four times; centralizing it as a pipe means a typo'd asset
 * gives the *same* JSON 400 from every endpoint, and the error shape
 * lives in one place if the dashboard ever wants to consume it.
 *
 * **The boundary it sits on.** This is the validation seam between
 * HTTP and the controller's typed signature — CLAUDE.md rule 5:
 * "Validate at boundaries; trust types inside." After this pipe runs,
 * the controller's `asset` parameter is an `AssetId`, not a `string`,
 * and downstream code (the chaos state service) can rely on the
 * exhaustiveness checks on the discriminated union without any
 * defensive `?? 'btc'` patterns.
 *
 * **Error shape.** A failed parse produces a `BadRequestException`
 * (Nest serializes that to a 400) with three fields:
 *
 *   { error: 'invalid_asset', message: 'unknown asset: btv', allowed: ['btc', 'eth'] }
 *
 * The `allowed` array is `AssetId.options`, which Zod exposes on the
 * enum schema — so it stays in sync automatically if the enum ever
 * grows. The dashboard does not consume `allowed` today, but
 * including it makes the response self-documenting for an operator
 * hitting the endpoint via curl.
 *
 * **Why `safeParse` and not `parse`.** `parse` throws a `ZodError`
 * with a different shape; we want full control over the JSON the
 * client sees (especially the stable `error: 'invalid_asset'` code
 * the dashboard could use for typed error handling).
 */
import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { AssetId } from '@price-oracle/contracts/primitives';

@Injectable()
export class AssetParamPipe implements PipeTransform<string, AssetId> {
  /**
   * Validate the raw route segment against the `AssetId` enum.
   *
   * @param value The raw string Nest pulled out of the `:asset`
   *              route segment.
   * @returns The validated `AssetId`.
   * @throws BadRequestException When the value is not a member of
   *         the `AssetId` enum. The response body includes the
   *         offending value and the list of allowed assets.
   */
  transform(value: string): AssetId {
    const parsed = AssetId.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_asset',
        message: `unknown asset: ${value}`,
        // Pulled from the Zod enum so adding a new asset to `AssetId`
        // propagates here without a manual list update.
        allowed: AssetId.options,
      });
    }
    return parsed.data;
  }
}
