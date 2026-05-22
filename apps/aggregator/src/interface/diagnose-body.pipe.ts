import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { PostDiagnoseRequestSchema } from '@price-oracle/contracts/rest';

import type { PostDiagnoseRequest } from '@price-oracle/contracts/rest';

@Injectable()
export class DiagnoseBodyPipe implements PipeTransform<unknown, PostDiagnoseRequest> {
  transform(value: unknown): PostDiagnoseRequest {
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
