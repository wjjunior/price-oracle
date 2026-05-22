import { Injectable, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

export const DEFAULT_AUDIT_LIMIT = 50;
export const MAX_AUDIT_LIMIT = 200;

const LimitSchema = z.coerce.number().int().positive().catch(DEFAULT_AUDIT_LIMIT);

@Injectable()
export class AuditLimitPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    if (value === undefined) {
      return DEFAULT_AUDIT_LIMIT;
    }
    const parsed = LimitSchema.parse(value);
    return Math.min(parsed, MAX_AUDIT_LIMIT);
  }
}
