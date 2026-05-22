import { z } from 'zod';

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export type AggregatorConfig = {
  anthropicApiKey?: string;
};

export function loadAggregatorConfig(env: NodeJS.ProcessEnv = process.env): AggregatorConfig {
  const parsed = EnvSchema.parse(env);
  return parsed.ANTHROPIC_API_KEY === undefined
    ? {}
    : { anthropicApiKey: parsed.ANTHROPIC_API_KEY };
}

export const AGGREGATOR_CONFIG = Symbol.for('@price-oracle/aggregator/config');
