import { Controller, Inject, type MessageEvent, Sse } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';

import { Orchestrator } from '../application/orchestrator.js';

import type { SseEnvelope } from '@price-oracle/contracts/sse';

const HEARTBEAT_MS = 15_000;
const HEARTBEAT_TYPE = 'heartbeat';

@Controller('api')
export class StreamController {
  constructor(@Inject(Orchestrator) private readonly orchestrator: Orchestrator) {}

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    const envelopes = new Observable<MessageEvent>((subscriber) => {
      const off = this.orchestrator.onEvent((envelope: SseEnvelope) => {
        subscriber.next({ data: envelope });
      });
      return off;
    });
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: HEARTBEAT_TYPE, data: '' })),
    );
    return merge(envelopes, heartbeat);
  }
}
