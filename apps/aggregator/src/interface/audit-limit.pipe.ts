/**
 * @file NestJS pipe for the `?limit=...` query parameter on
 * `/api/audit`.
 *
 * **Three behaviors** that the pipe enforces together:
 *
 *  1. **Default**: missing parameter → `DEFAULT_AUDIT_LIMIT` (50).
 *     Same default the dashboard's initial audit-timeline page
 *     requests; aligns server and client expectations without
 *     duplicating the magic number on both sides.
 *  2. **Coerce + sanitize**: a non-numeric or non-positive value
 *     falls through to the `.catch(DEFAULT_AUDIT_LIMIT)` branch
 *     rather than throwing. The audit endpoint is a "make a best
 *     effort, never page someone" surface — a malformed query
 *     parameter on a UI button click should not return 400.
 *  3. **Cap**: any value above `MAX_AUDIT_LIMIT` (200) clamps to
 *     200. Operator-driven calls cannot accidentally pull the entire
 *     audit history; long-tail audit retention is a future concern,
 *     but for now the cap is a defensive backstop.
 *
 * **CLAUDE.md rule 2** (named constants for domain-meaningful
 * numbers). Both `50` and `200` are exported so any future caller
 * that needs to reference them (e.g. the dashboard's pagination
 * widget) imports the value rather than duplicating the literal.
 *
 * **`.catch(DEFAULT_AUDIT_LIMIT)` not `.optional()`.** Zod's
 * `.catch(...)` swallows *any* parse failure and substitutes the
 * fallback. That is the right semantics here — `limit=foo`
 * (NaN-coerce), `limit=-3` (failed `.positive()`), and `limit=` (empty
 * string → NaN) all degrade to the default rather than rejecting the
 * whole request.
 *
 * Cross-references:
 *  - `audit.controller.ts`: the consumer.
 *  - `mongo-audit.ts::recent(limit)`: the receiver that honors the
 *    capped value.
 */
import { Injectable, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/**
 * Default page size — matches the dashboard's initial request.
 */
export const DEFAULT_AUDIT_LIMIT = 50;

/**
 * Upper bound on operator-requested page size. Anything above this
 * silently clamps to this value.
 */
export const MAX_AUDIT_LIMIT = 200;

/**
 * Coerce-or-default schema. `.catch` swallows every parse failure
 * (non-numeric, non-positive, NaN) and falls back to the default —
 * see file header on why we degrade rather than reject.
 */
const LimitSchema = z.coerce.number().int().positive().catch(DEFAULT_AUDIT_LIMIT);

@Injectable()
export class AuditLimitPipe implements PipeTransform<unknown, number> {
  /**
   * Apply all three behaviors:
   *  - missing → `DEFAULT_AUDIT_LIMIT`,
   *  - present-but-bogus → `DEFAULT_AUDIT_LIMIT` (via `.catch`),
   *  - present-and-valid-but-too-large → clamp to `MAX_AUDIT_LIMIT`.
   */
  transform(value: unknown): number {
    if (value === undefined) {
      return DEFAULT_AUDIT_LIMIT;
    }
    const parsed = LimitSchema.parse(value);
    return Math.min(parsed, MAX_AUDIT_LIMIT);
  }
}
