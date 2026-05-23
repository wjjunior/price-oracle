import { Controller, Get } from '@nestjs/common';

type HealthResponse = {
  readonly status: 'ok';
  readonly service: 'ingestor-mock';
  readonly uptimeMs: number;
};

@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'ingestor-mock',
      uptimeMs: Date.now() - this.startedAt,
    };
  }
}
