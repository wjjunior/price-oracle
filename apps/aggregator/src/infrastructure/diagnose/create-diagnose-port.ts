import Anthropic from '@anthropic-ai/sdk';

import { AnthropicDiagnoseAdapter } from './anthropic-diagnose.adapter.js';
import { RateLimitedDiagnose } from './rate-limited-diagnose.decorator.js';
import { StubDiagnoseAdapter } from './stub-diagnose.adapter.js';

import type { AnthropicLike } from './anthropic-diagnose.adapter.js';
import type { DiagnosePort } from '../../domain/ports/diagnose.port.js';

export type CreateDiagnosePortDeps = {
  apiKey?: string;
  clock?: () => number;
  client?: AnthropicLike;
};

function realClient(apiKey: string): AnthropicLike {
  const sdk = new Anthropic({ apiKey });
  return {
    messages: {
      create: async (body, options) => {
        const m = await sdk.messages.create(
          { ...body, stream: false, messages: [...body.messages] },
          options,
        );
        return { content: m.content, usage: m.usage };
      },
    },
  };
}

export function createDiagnosePort(deps: CreateDiagnosePortDeps = {}): DiagnosePort {
  const clock = deps.clock ?? Date.now;
  const inner: DiagnosePort =
    deps.apiKey !== undefined
      ? new AnthropicDiagnoseAdapter(deps.client ?? realClient(deps.apiKey), clock)
      : new StubDiagnoseAdapter(clock);
  return new RateLimitedDiagnose(inner, clock);
}
