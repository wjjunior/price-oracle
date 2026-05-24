/**
 * @file The single boundary at which the mock ingestor reads
 * `process.env`. Every other file in the app consumes the typed
 * `IngestorConfig` object produced here, never `process.env.FOO`
 * directly (CLAUDE.md rule 11).
 *
 * **Why one schema, one parse, one shape.** The Zod schema below is
 * both the validation and the documentation of every env var the
 * mock accepts. `loadIngestorConfig()` runs once at boot in
 * `main.ts`, throws on any invalid value, and produces a typed
 * `IngestorConfig`. Downstream code (`TickGeneratorService`,
 * `AdminModule`, `NatsModule`, `AdminController`) injects that
 * object via the `INGESTOR_CONFIG` symbol and trusts the types —
 * the parse is the only validation needed (rule 5: "Validate at
 * boundaries; trust types inside").
 *
 * **Defaults.** Every var has a default tuned for local dev:
 *
 *  - `MOCK_HTTP_PORT = 7401`: chosen well outside common ranges
 *    (1024-8080) so it does not collide with the dashboard, the
 *    aggregator, or other local services.
 *  - `MOCK_TICK_INTERVAL_MS = 250`: four ticks/second, matching the
 *    rough cadence of real BTC trades during active markets. The
 *    aggregator's aggregation cadence is 500 ms, so we publish about
 *    twice per aggregate — enough for cross-source agreement to be
 *    meaningful within each aggregation window.
 *  - `MOCK_BTC_ANCHOR_USD = 76_000`, `MOCK_ETH_ANCHOR_USD = 2_070`:
 *    tuned to current spot at the time of writing. The mock seeds
 *    its random walk near recent real spot prices so it *agrees*
 *    with Binance and Coinbase at baseline — that is what makes the
 *    chaos demos compelling: agreement is high in HEALTHY mode,
 *    degrades when the mock goes STALE while real sources move,
 *    and is irrelevant in DISCONNECTED/MALFORMED mode (no
 *    contribution).
 *  - `MOCK_PRICE_VOLATILITY_PCT = 0.001`: ±0.1% per step. Multiplied
 *    by the anchor that's $76 on BTC and $2.07 on ETH per tick —
 *    realistic intraday jitter without rocketing away from spot.
 *    See `random-walk.ts` for the multiplicative formula.
 *  - `MOCK_ADMIN_ENABLED = false`: the security-critical default. The
 *    chaos admin API is dev-only; a deployed mock image without this
 *    flag set explicitly to `true` is safe. PRO-44 introduced the
 *    flag; PRO-54 flipped the default to `false`. See
 *    `admin/admin.module.ts` for the gating logic and CLAUDE.md
 *    operational quirks ("Mock ingestor admin API is dev-only").
 *  - `NATS_URL = nats://localhost:4222`: the default address served
 *    by `pnpm dev:infra`.
 *
 * **`z.coerce` on numeric vars.** Env vars are always strings, but
 * we want `number` after the parse. `z.coerce.number()` runs
 * `Number(value)` before validating, so `MOCK_HTTP_PORT="7401"` from
 * the shell becomes `7401`. `int().positive()` rejects `"0"`,
 * `"7.5"`, and `"-1"` with a clear error.
 *
 * **`z.stringbool()` for `MOCK_ADMIN_ENABLED`.** Accepts the human-
 * friendly set (`'true'`, `'false'`, `'1'`, `'0'`, `'yes'`, `'no'`,
 * etc.) and produces a real `boolean`. Critical because the default
 * is `false`: a typo like `MOCK_ADMIN_ENABLED=yse` should *fail
 * loudly at boot*, not silently fall back to `false` (which is what
 * a naive `=== 'true'` check would do) and leave the operator
 * wondering why their chaos endpoints 404.
 *
 * **`NatsUrl` refinement.** The standard `z.url()` accepts any
 * scheme; we constrain to `nats://` because a misconfigured value
 * like `https://localhost:4222` would parse as a URL, fail to
 * connect, and produce a misleading error far from the source. The
 * `{ error: ... }` option gives a custom message the operator sees
 * directly in the bootstrap error log.
 */
import { z } from 'zod';

/** Default NATS broker URL — matches `pnpm dev:infra`. */
export const DEFAULT_NATS_URL = 'nats://localhost:4222';
/** Default HTTP port for `/health` + (when enabled) `/admin/...`. */
export const DEFAULT_HTTP_PORT = 7401;
/** Default tick cadence — four ticks/second. See file header. */
export const DEFAULT_TICK_INTERVAL_MS = 250;
/** Default BTC anchor — tuned to recent spot to maximize baseline agreement. */
export const DEFAULT_BTC_ANCHOR_USD = 76_000;
/** Default ETH anchor — tuned to recent spot to maximize baseline agreement. */
export const DEFAULT_ETH_ANCHOR_USD = 2_070;
/** Default volatility — ±0.1% per step, multiplicative. See `random-walk.ts`. */
export const DEFAULT_PRICE_VOLATILITY_PCT = 0.001;
/**
 * Default for `MOCK_ADMIN_ENABLED`: `false`. The chaos surface is
 * off by default so a deployed mock image is safe outside dev.
 * PRO-54 flipped this from `true` to `false`.
 */
export const DEFAULT_ADMIN_ENABLED = false;

/**
 * `nats://`-scheme URL validator. Rejects `https://`, `tcp://`,
 * `ws://`, etc. before the NATS client gets a chance to fail with
 * its own (less helpful) connect error.
 */
const NatsUrl = z.url({ error: 'must be a full URL with scheme', protocol: /^nats$/i });

/**
 * Env schema — the source of truth for what the mock reads from the
 * environment and what shape each value takes after coercion.
 */
const EnvSchema = z.object({
  MOCK_HTTP_PORT: z.coerce.number().int().positive().default(DEFAULT_HTTP_PORT),
  MOCK_TICK_INTERVAL_MS: z.coerce.number().int().positive().default(DEFAULT_TICK_INTERVAL_MS),
  MOCK_BTC_ANCHOR_USD: z.coerce.number().positive().default(DEFAULT_BTC_ANCHOR_USD),
  MOCK_ETH_ANCHOR_USD: z.coerce.number().positive().default(DEFAULT_ETH_ANCHOR_USD),
  MOCK_PRICE_VOLATILITY_PCT: z.coerce.number().nonnegative().default(DEFAULT_PRICE_VOLATILITY_PCT),
  // `z.stringbool()` rejects typos rather than silently falling back
  // to `false` — see file header for why that matters.
  MOCK_ADMIN_ENABLED: z.stringbool().default(DEFAULT_ADMIN_ENABLED),
  NATS_URL: NatsUrl.default(DEFAULT_NATS_URL),
});

/**
 * The typed config the rest of the app consumes. Renamed from
 * `SCREAMING_SNAKE_CASE` env names to `camelCase` fields because
 * the env names are a wire concern (`MOCK_BTC_ANCHOR_USD`) and the
 * field names are a domain concern (`btcAnchorUsd`). Keeping them
 * separated means we can rename the env var without changing every
 * consumer, and the field name does not have to carry the prefix.
 */
export type IngestorConfig = {
  httpPort: number;
  tickIntervalMs: number;
  btcAnchorUsd: number;
  ethAnchorUsd: number;
  priceVolatilityPct: number;
  adminEnabled: boolean;
  natsUrl: string;
};

/**
 * Parse `process.env` (or any env-shaped object) into a typed
 * `IngestorConfig`. Called once at boot from `main.ts`.
 *
 * The `env` parameter exists for testing — `env.schema.test.ts`
 * passes synthetic env objects to exercise the schema. Production
 * uses the default `process.env`.
 *
 * @throws ZodError When any env var is set to an invalid value.
 *                  `main.ts` catches this and exits 1 with a
 *                  structured JSON log line.
 */
export function loadIngestorConfig(env: NodeJS.ProcessEnv = process.env): IngestorConfig {
  const parsed = EnvSchema.parse(env);
  return {
    httpPort: parsed.MOCK_HTTP_PORT,
    tickIntervalMs: parsed.MOCK_TICK_INTERVAL_MS,
    btcAnchorUsd: parsed.MOCK_BTC_ANCHOR_USD,
    ethAnchorUsd: parsed.MOCK_ETH_ANCHOR_USD,
    priceVolatilityPct: parsed.MOCK_PRICE_VOLATILITY_PCT,
    adminEnabled: parsed.MOCK_ADMIN_ENABLED,
    natsUrl: parsed.NATS_URL,
  };
}

/**
 * NestJS DI token for `IngestorConfig`. Using `Symbol.for(...)`
 * (the global registry) rather than `Symbol(...)` so the same token
 * resolves across module instances — guards against the (extremely
 * unlikely but easy-to-debug-if-it-bit-you) case of accidental
 * double-evaluation of this file via two distinct import resolutions.
 */
export const INGESTOR_CONFIG = Symbol.for('@price-oracle/ingestor-mock/config');
