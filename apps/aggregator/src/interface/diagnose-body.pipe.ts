/**
 * @file NestJS pipe that validates the `POST /api/diagnose` request
 * body.
 *
 * **Why a dedicated pipe.** NestJS supports `@UsePipes(new ValidationPipe())`
 * globally with `class-validator` decorators, but this codebase
 * uses Zod schemas for every cross-service contract
 * (`decisions.md` Entry 1). The diagnose controller calls
 * `PostDiagnoseRequestSchema.safeParse` via this pipe, keeps the
 * Zod issue list when validation fails, and surfaces a structured
 * 400 to the dashboard.
 *
 * **`value ?? {}` to tolerate an empty body.** The diagnose POST
 * accepts an entirely empty body — every field on
 * `PostDiagnoseRequest` is optional. NestJS delivers a missing
 * JSON body as `undefined`; the `?? {}` substitutes an empty object
 * so the schema can apply its defaults rather than reporting "input
 * must be an object".
 *
 * **Structured error body.** `{ error: 'invalid_body', issues: [...] }`
 * — the `issues` field carries Zod's per-field error list so the
 * dashboard can render field-specific messages. This is consistent
 * with the shape used by the asset pipes.
 *
 * Cross-references:
 *  - `@price-oracle/contracts/rest::PostDiagnoseRequestSchema`: the
 *    schema this pipe runs.
 *  - `diagnose.controller.ts`: the only caller.
 */
import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { PostDiagnoseRequestSchema } from '@price-oracle/contracts/rest';

import type { PostDiagnoseRequest } from '@price-oracle/contracts/rest';

@Injectable()
export class DiagnoseBodyPipe implements PipeTransform<unknown, PostDiagnoseRequest> {
  /**
   * Validate the body against `PostDiagnoseRequestSchema`. Missing
   * body → empty object (schema defaults apply). Schema failure →
   * `BadRequestException` carrying the Zod issue list.
   */
  transform(value: unknown): PostDiagnoseRequest {
    // `??` covers the "no body" path. The contract schema is
    // permissive enough to apply defaults from there.
    const parsed = PostDiagnoseRequestSchema.safeParse(value ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_body',
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}
