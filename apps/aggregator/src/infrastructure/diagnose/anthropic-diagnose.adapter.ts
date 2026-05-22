import { DiagnoseUnavailableError } from '../../domain/ports/diagnose.port.js';

import type {
  DiagnoseContext,
  DiagnosePort,
  DiagnoseResult,
} from '../../domain/ports/diagnose.port.js';
import type { SourceState } from '../../domain/types.js';

const DIAGNOSE_MODEL = 'claude-haiku-4-5-20251001';
const DIAGNOSE_MAX_TOKENS = 1024;
const DIAGNOSE_TIMEOUT_MS = 10_000;

export interface AnthropicLike {
  messages: {
    create(
      body: {
        model: string;
        max_tokens: number;
        messages: ReadonlyArray<{ role: 'user'; content: string }>;
      },
      options?: { signal?: AbortSignal },
    ): Promise<{
      content: ReadonlyArray<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    }>;
  };
}

function summarizeSources(sources: readonly SourceState[]): string {
  return sources
    .map((s) => `- ${s.source}: ${s.health}, lastPrice=${s.lastPrice ?? 'n/a'}`)
    .join('\n');
}

function buildPrompt(context: DiagnoseContext): string {
  return [
    `You are an observability assistant for a crypto price oracle. Asset: ${context.asset}.`,
    `Current confidence: ${context.confidence}. Circuit breaker: ${context.breaker}.`,
    `Per-source state:`,
    summarizeSources(context.sources),
    `Recent audit events (${context.recentEvents.length}): ${JSON.stringify(context.recentEvents)}`,
    `Explain the current price-feed health in concise Markdown for an operator. Note likely causes and suggested checks.`,
  ].join('\n');
}

function extractText(content: ReadonlyArray<{ type: string; text?: string }>): string | null {
  const block = content.find((c) => c.type === 'text' && typeof c.text === 'string');
  return block?.text ?? null;
}

export class AnthropicDiagnoseAdapter implements DiagnosePort {
  constructor(
    private readonly client: AnthropicLike,
    private readonly clock: () => number,
  ) {}

  async diagnose(context: DiagnoseContext): Promise<DiagnoseResult> {
    const start = this.clock();
    let response: Awaited<ReturnType<AnthropicLike['messages']['create']>>;
    try {
      response = await this.client.messages.create(
        {
          model: DIAGNOSE_MODEL,
          max_tokens: DIAGNOSE_MAX_TOKENS,
          messages: [{ role: 'user', content: buildPrompt(context) }],
        },
        { signal: AbortSignal.timeout(DIAGNOSE_TIMEOUT_MS) },
      );
    } catch (err: unknown) {
      throw new DiagnoseUnavailableError('anthropic diagnose call failed', { cause: err });
    }
    const markdown = extractText(response.content);
    if (markdown === null) {
      throw new DiagnoseUnavailableError('anthropic diagnose returned no text content');
    }
    const latencyMs = this.clock() - start;
    const usage = response.usage;
    return usage === undefined
      ? { markdown, latencyMs }
      : { markdown, latencyMs, tokensUsed: usage.input_tokens + usage.output_tokens };
  }
}
