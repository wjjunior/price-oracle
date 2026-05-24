/**
 * @file Environment-variable contract for the Binance ingestor.
 *
 * This is the single module in the app that touches `process.env`
 * (CLAUDE.md rule 11). Everywhere else imports the typed
 * {@link IngestorConfig} via the {@link INGESTOR_CONFIG} DI token —
 * see `apps/ingestor-binance/src/config/config.module.ts` for the
 * NestJS wiring, and `binance/binance.service.ts` for a consumer.
 *
 * The schema validates incoming env vars with Zod and re-shapes them
 * from `SCREAMING_SNAKE_CASE` (the operator-facing convention) into
 * a camelCase TypeScript object (the in-code convention). Defaults
 * exist so a developer can run `pnpm dev` against the local
 * docker-compose stack with no `.env` file at all; production
 * deployments override both.
 *
 * Validation is strict: any env var present but malformed (e.g.
 * `NATS_URL=notaurl`) aborts boot via the Zod `parse` throw in
 * `loadIngestorConfig`. That is the failure mode CLAUDE.md rule 11
 * mandates — "App fails to boot if required env vars are missing or
 * invalid."
 *
 * The sibling Coinbase ingestor (`apps/ingestor-coinbase/`) carries
 * the same shape with a `COINBASE_WS_URL` instead of
 * `BINANCE_WS_URL`; the mock ingestor adds extra knobs for the
 * chaos admin API.
 */
import { z } from 'zod';

/**
 * Public Binance combined-stream URL with both BTC and ETH trade
 * streams pre-subscribed. The `?streams=btcusdt@trade/ethusdt@trade`
 * suffix is Binance's documented multiplexing syntax — frames arrive
 * wrapped in an envelope `{ stream, data }` (see
 * `BinanceCombinedTradeEnvelopeSchema` in `trade-event.schema.ts`).
 *
 * Hard-coding both symbols here matches the closed `AssetId` set in
 * `@price-oracle/contracts/primitives`; adding a new asset means
 * extending that enum and this URL together.
 */
export const DEFAULT_BINANCE_WS_URL =
  'wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade';

/**
 * Default NATS broker URL. Matches the broker exposed by
 * `infra/docker-compose.yml` so local `pnpm dev:infra` + `pnpm dev`
 * just works.
 */
export const DEFAULT_NATS_URL = 'nats://localhost:4222';

// Accept both HTTP(S) and WS(S). Binance's real endpoint is `wss://`
// but tests and local replays may point at `ws://` (no TLS) or even
// `http(s)://` for a fixture server, so we don't lock it down further.
const HttpsOrWssUrl = z.url({
  error: 'must be a full URL with scheme',
  protocol: /^(wss?|https?)$/i,
});

// NATS URLs use their own `nats://` scheme; refuse anything else so a
// typo like `NATS_URL=http://localhost:4222` fails loudly at boot
// rather than producing an opaque client error later.
const NatsUrl = z.url({
  error: 'must be a full URL with scheme',
  protocol: /^nats$/i,
});

const EnvSchema = z.object({
  BINANCE_WS_URL: HttpsOrWssUrl.default(DEFAULT_BINANCE_WS_URL),
  NATS_URL: NatsUrl.default(DEFAULT_NATS_URL),
});

/**
 * In-app representation of the validated config.
 *
 * Kept as a hand-written type (rather than `z.infer<typeof EnvSchema>`)
 * because the schema uses operator-facing SCREAMING_SNAKE_CASE while
 * the rest of the codebase reads camelCase. The mapping happens once
 * inside `loadIngestorConfig`; consumers never see the raw env shape.
 */
export type IngestorConfig = {
  binanceWsUrl: string;
  natsUrl: string;
};

/**
 * Parse, validate, and re-shape the process environment into an
 * `IngestorConfig`. Called exactly once at boot by the
 * `ConfigModule`'s factory provider.
 *
 * @param env Process env to read from. Defaults to `process.env`;
 *            tests can pass a synthetic record to exercise edge
 *            cases (missing vars, malformed URLs) without polluting
 *            the real environment.
 * @throws ZodError if any env var is present but fails validation —
 *                  caller (`loadIngestorConfig`'s only call site in
 *                  `config.module.ts`) lets this propagate up and
 *                  abort the Nest bootstrap.
 * @returns Frozen-by-convention, fully-typed config object.
 */
export function loadIngestorConfig(env: NodeJS.ProcessEnv = process.env): IngestorConfig {
  const parsed = EnvSchema.parse(env);
  return {
    binanceWsUrl: parsed.BINANCE_WS_URL,
    natsUrl: parsed.NATS_URL,
  };
}

/**
 * DI token for the config object. A `Symbol.for(...)` (not a string)
 * so it is structurally unique across the workspace — there is no
 * chance of accidentally colliding with another package's "config"
 * token even if both were registered in the same Nest container.
 *
 * Consumers inject this with `@Inject(INGESTOR_CONFIG)`. The explicit
 * `@Inject(...)` is mandatory under `tsx` because esbuild does not
 * emit TypeScript decorator metadata (CLAUDE.md operational quirks —
 * "NestJS DI under `tsx` needs explicit `@Inject()`").
 */
export const INGESTOR_CONFIG = Symbol.for('@price-oracle/ingestor-binance/config');
