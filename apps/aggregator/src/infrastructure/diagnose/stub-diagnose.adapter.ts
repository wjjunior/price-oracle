import { hashDiagnoseContext } from './diagnose-context-hash.js';

import type {
  DiagnoseContext,
  DiagnosePort,
  DiagnoseResult,
} from '../../domain/ports/diagnose.port.js';
import type { SourceState } from '../../domain/types.js';

const HEALTHY: SourceState['health'] = 'HEALTHY';

function confidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function degradedSources(sources: readonly SourceState[]): readonly string[] {
  return sources.filter((s) => s.health !== HEALTHY).map((s) => s.source);
}

export class StubDiagnoseAdapter implements DiagnosePort {
  constructor(private readonly clock: () => number) {}

  diagnose(context: DiagnoseContext): Promise<DiagnoseResult> {
    const start = this.clock();
    const degraded = degradedSources(context.sources);
    const lines = [
      `# Diagnose (stub) — ${context.asset}`,
      '',
      `- Confidence: ${confidencePercent(context.confidence)}`,
      `- Breaker: ${context.breaker}`,
      `- Degraded sources: ${degraded.length > 0 ? degraded.join(', ') : 'none'}`,
      `- Recent events: ${context.recentEvents.length}`,
      '',
      `_Deterministic stub response; fingerprint ${hashDiagnoseContext(context)}._`,
    ];
    return Promise.resolve({ markdown: lines.join('\n'), latencyMs: this.clock() - start });
  }
}
