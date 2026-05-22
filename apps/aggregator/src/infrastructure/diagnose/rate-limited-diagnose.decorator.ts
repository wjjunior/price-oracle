import { DiagnoseRateLimitedError } from '../../domain/ports/diagnose.port.js';

import { hashDiagnoseContext } from './diagnose-context-hash.js';


import type {
  DiagnoseContext,
  DiagnosePort,
  DiagnoseResult,
} from '../../domain/ports/diagnose.port.js';
import type { AssetId } from '@price-oracle/contracts/primitives';

const DIAGNOSE_RATE_LIMIT_WINDOW_MS = 10_000;

export class RateLimitedDiagnose implements DiagnosePort {
  private readonly inFlight = new Map<string, Promise<DiagnoseResult>>();
  // Per-asset, not per-client: this single-operator tool has no client identity to key on,
  // and the window's job is to guard the LLM call's cost/latency — a per-asset scope (the
  // natural unit of a per-asset diagnose) does that. See System Design §7.2.
  private readonly lastStartAt = new Map<AssetId, number>();

  constructor(
    private readonly inner: DiagnosePort,
    private readonly clock: () => number,
    private readonly windowMs: number = DIAGNOSE_RATE_LIMIT_WINDOW_MS,
  ) {}

  diagnose(context: DiagnoseContext): Promise<DiagnoseResult> {
    const key = `${context.asset}:${hashDiagnoseContext(context)}`;
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing;

    const now = this.clock();
    const last = this.lastStartAt.get(context.asset);
    if (last !== undefined && now - last < this.windowMs) {
      return Promise.reject(new DiagnoseRateLimitedError(this.windowMs - (now - last)));
    }

    this.lastStartAt.set(context.asset, now);
    const pending = this.inner.diagnose(context).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return pending;
  }
}
