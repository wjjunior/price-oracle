/**
 * @file Deterministic stub adapter for `DiagnosePort`.
 *
 * **The point of this adapter** is the "runs end-to-end without
 * secrets" non-functional requirement (`decisions.md` Entry 6,
 * CLAUDE.md operational quirks: "Anthropic stub fallback preserves
 * end-to-end runnability without secrets"). A reviewer can `pnpm dev`
 * blind on a fresh clone, with no `ANTHROPIC_API_KEY` set, click the
 * diagnose button on the dashboard, and see a Markdown response —
 * just like the real adapter, same shape, same controller, same SSE
 * envelope.
 *
 * **Why this is a real adapter, not a mock.** The orchestrator code
 * path is *identical* whether the real or stub adapter is wired in.
 * If diagnose were short-circuited inside the orchestrator with an
 * `if (anthropicKey) { ... } else { ... }`, two consequences would
 * follow:
 *  1. The "no key" code path would never exercise in actual demos —
 *     the orchestrator would skip the diagnose pipeline entirely,
 *     hiding bugs in the audit-write and SSE-emit flows that the
 *     controller and the rate-limit decorator depend on.
 *  2. The use case would need to know about a deployment concern
 *     ("is the API key set?"), which violates CLAUDE.md rule 5 and
 *     rule 11.
 *
 * The port-based design makes this a one-line conditional in the
 * composition root (`create-diagnose-port.ts`), and the rest of the
 * system stays oblivious.
 *
 * **Deterministic content.** The stub renders a Markdown summary
 * built from the `DiagnoseContext` itself — confidence as a percent,
 * breaker label, a degraded-source list, and a recent-event count.
 * The trailing fingerprint (`hashDiagnoseContext`) is the same hash
 * the rate-limit decorator uses for in-flight dedup; it gives the
 * dashboard a visible "same context → same response" signal during
 * demos.
 *
 * **`Promise.resolve` instead of `async`.** The stub has no awaitable
 * work; wrapping the synchronous result in `Promise.resolve` keeps
 * the port's `Promise<DiagnoseResult>` shape without spinning up an
 * unnecessary microtask scheduler frame. The latency value we report
 * is the actual time spent building the response — tiny, but
 * non-zero, so the dashboard's "X ms" label has something to render.
 *
 * Cross-references:
 *  - `domain/ports/diagnose.port.ts`: the port + the typed errors.
 *  - `create-diagnose-port.ts`: the composition-time selector.
 *  - `anthropic-diagnose.adapter.ts`: the real adapter; shares this
 *    port.
 *  - `diagnose-context-hash.ts`: the canonical hash both this
 *    adapter and the rate-limit decorator consult.
 *  - `decisions.md` Entry 6.
 */
import { hashDiagnoseContext } from './diagnose-context-hash.js';

import type {
  DiagnoseContext,
  DiagnosePort,
  DiagnoseResult,
} from '../../domain/ports/diagnose.port.js';
import type { SourceState } from '../../domain/types.js';

/**
 * Reuse the canonical HEALTHY literal from the contract type. We
 * type-pin it here (rather than `as const`) so the file's
 * "what counts as not-healthy" filter is symmetric with the FSM.
 */
const HEALTHY: SourceState['health'] = 'HEALTHY';

/**
 * Render `0.876` as `88%`. The dashboard formats confidence the same
 * way elsewhere — keep the stub's percentage shape consistent so a
 * stub-vs-real swap is visually indistinguishable to a casual demo
 * viewer.
 */
function confidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Names of sources currently not HEALTHY — DEGRADED or STALE. The
 * stub renders these as a comma-separated list, or "none" if every
 * source is healthy. Same content shape the real adapter would emit
 * when summarizing the same context.
 */
function degradedSources(sources: readonly SourceState[]): readonly string[] {
  return sources.filter((s) => s.health !== HEALTHY).map((s) => s.source);
}

export class StubDiagnoseAdapter implements DiagnosePort {
  /**
   * @param clock Wall-clock provider for latency measurement. Same
   *              parameterization as the Anthropic adapter; tests
   *              drive a fake clock here too.
   */
  constructor(private readonly clock: () => number) {}

  /**
   * Build the deterministic Markdown body, measure its build time,
   * and resolve. `hashDiagnoseContext(context)` produces the same
   * 16-hex-char fingerprint the rate-limit decorator uses for dedup
   * — surfacing it in the rendered Markdown helps a reviewer
   * correlate "I called diagnose twice with the same context, why
   * did the second call hit the rate limiter?" with the
   * deduplication key.
   */
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
