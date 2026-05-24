/**
 * @file Process-level env-var schema for the aggregator app.
 *
 * **CLAUDE.md rule 11 — `process.env` only in the config module.** This
 * file (together with `interface/orchestrator.config.ts` for the
 * orchestrator-specific tuning) is the *one* place the aggregator
 * touches `process.env`. Everything else imports the parsed,
 * typed config object via the `AGGREGATOR_CONFIG` DI token.
 *
 * **What lives here vs `orchestrator.config.ts`.** This file owns the
 * **process-level** wiring: where Mongo and NATS live, what HTTP port
 * to bind, whether an Anthropic API key is available. The orchestrator
 * config file owns the **business tuning**: pulse cadence, FSM
 * thresholds, breaker streaks, anomaly tolerance. The split keeps the
 * orchestrator config focused on knobs an operator would actually
 * touch in production, separate from the deployment plumbing that
 * rarely changes.
 *
 * **`ANTHROPIC_API_KEY` is optional.** This is the linchpin of the
 * "runs end-to-end without secrets" non-functional requirement
 * (`decisions.md` Entry 6, CLAUDE.md operational quirks). When the
 * key is absent, `app.module.ts` selects the deterministic stub
 * adapter; when it is present, the real Anthropic adapter. Same code
 * path in the orchestrator either way.
 *
 * **Defaults match `pnpm dev:infra`.** `nats://localhost:4222`,
 * `mongodb://localhost:27017/price_oracle`, port 7402, dashboard at
 * 5173 — the values a reviewer will hit on a fresh clone. Production
 * deployments override every one of these via environment.
 *
 * **NATS_URL is strictly validated.** `z.url(...)` with a `nats:`
 * scheme regex — a typo'd `http://nats:4222` fails boot rather than
 * confusing the NATS client with a cryptic connection error. This is
 * CLAUDE.md rule 5 applied at the env boundary.
 *
 * **Conditional spread for `anthropicApiKey`.** We avoid setting the
 * property to `undefined` when the env var is absent — that would let
 * `exactOptionalPropertyTypes` widen the field's type to include
 * `undefined`, which leaks through to every consumer that destructures
 * the config. The spread keeps the property genuinely missing instead
 * of present-with-undefined.
 */
import { z } from 'zod';

/**
 * Reusable schema for a NATS URL. The `protocol` constraint rejects
 * any scheme that is not `nats` — `http://`, `mongodb://`, and the
 * empty string all fail with a clear error message at boot.
 */
const NatsUrl = z.url({ error: 'must be a full URL with scheme', protocol: /^nats$/i });

/**
 * The raw env schema. Field names match the actual env-var names
 * (UPPER_SNAKE_CASE) so error messages from `parse()` point a
 * reviewer at the variable they need to set.
 */
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  NATS_URL: NatsUrl.default('nats://localhost:4222'),
  MONGO_URL: z.string().min(1).default('mongodb://localhost:27017/price_oracle'),
  AGGREGATOR_HTTP_PORT: z.coerce.number().int().positive().default(7402),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
});

/**
 * The typed config the rest of the app consumes. Note the camelCase
 * field names — the boundary translation (UPPER_SNAKE_CASE → camelCase)
 * happens once, here, and the typed shape is what every consumer
 * sees. `anthropicApiKey` is genuinely optional: present only when
 * the env var was set, so an `if (cfg.anthropicApiKey)` check
 * narrows the type cleanly without a null-vs-undefined dance.
 */
export type AggregatorConfig = {
  anthropicApiKey?: string;
  natsUrl: string;
  mongoUrl: string;
  httpPort: number;
  corsOrigin: string;
};

/**
 * Parse a `NodeJS.ProcessEnv` (default: `process.env`) into a typed
 * `AggregatorConfig`. The function is exported so tests can drive
 * arbitrary env-shaped objects through it without setting actual
 * env vars on `process.env`.
 *
 * Throws (via Zod) on invalid input — the bootstrap handler in
 * `main.ts` catches and emits a structured `bootstrap.failed` log,
 * then exits with code 1. That is the only acceptable response to a
 * malformed environment: refuse to start.
 *
 * @param env A `process.env`-shaped object. Defaults to `process.env`
 *            itself, which is what the DI factory in `app.module.ts`
 *            passes.
 */
export function loadAggregatorConfig(env: NodeJS.ProcessEnv = process.env): AggregatorConfig {
  const parsed = EnvSchema.parse(env);
  const base: AggregatorConfig = {
    natsUrl: parsed.NATS_URL,
    mongoUrl: parsed.MONGO_URL,
    httpPort: parsed.AGGREGATOR_HTTP_PORT,
    corsOrigin: parsed.CORS_ORIGIN,
  };
  // Spread the key only if it is present — see file header for the
  // exactOptionalPropertyTypes reasoning.
  return parsed.ANTHROPIC_API_KEY === undefined
    ? base
    : { ...base, anthropicApiKey: parsed.ANTHROPIC_API_KEY };
}

/**
 * DI token for the parsed config. Symbol-keyed via `Symbol.for(...)`
 * so the same identity is shared even if the module is imported
 * through two different specifier paths.
 *
 * CLAUDE.md operational quirks: every constructor injection that
 * consumes this token must use `@Inject(AGGREGATOR_CONFIG)` explicitly
 * — `tsx` does not emit decorator metadata, so type-based injection
 * silently resolves to `undefined`.
 */
export const AGGREGATOR_CONFIG = Symbol.for('@price-oracle/aggregator/config');
