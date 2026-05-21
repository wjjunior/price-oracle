# PRO-12 — Mock ingestor with per-asset chaos admin API

**Date:** 2026-05-21
**Jira:** [PRO-12](https://wagner-dev.atlassian.net/browse/PRO-12)
**Status:** Approved for implementation

## Context

Phase 2 of the construction plan begins with the synthetic source. The mock ingestor is the only ingestor that exposes an admin surface: it generates BTC and ETH ticks at a configurable cadence and accepts HTTP commands to drive controlled degradation per asset. Real ingestors (Binance, Coinbase) have no admin endpoints — their failures are observed, not injected (System Design §1, §3.5).

Three failure modes are required: `disconnect`, `stale`, `malformed`. They must be observably distinct on the wire so the aggregator's source health FSM (staleness via freshness decay), anomaly detector (frozen value drift vs. market — System Design §4.5), and Zod boundary validation each have a canonical trigger from the same source.

## Goals

- Publish valid `Tick` payloads for BTC and ETH on `ticks.<asset>.mock` at ~250 ms cadence.
- Expose an idempotent admin HTTP API to apply per-asset chaos modes that map 1:1 to the aggregator's failure paths.
- Provide a `reset-all` endpoint and a `GET /admin/status` snapshot.
- Propagate a correlation ID per tick via NATS message headers (System Design §3.9, §A.2).

## Non-goals

- Real-exchange WS adapter — covered by PRO-13/14.
- Aggregator domain logic — covered by Phase 3.
- Cross-service integration tests with Testcontainers — Phase 4.
- Numeric `latency` / `drift` injection knobs (touchstone-v0 has these; PRO-12 collapses to three discrete modes).

## Architecture

Thin NestJS module (no hexagonal layering — System Design §3.5). Layout:

```
apps/ingestor-mock/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── main.ts                          # Nest bootstrap, HTTP listen
    ├── app.module.ts                    # composes ConfigModule + NatsModule + MockModule + AdminModule
    ├── config/
    │   ├── env.schema.ts                # Zod parse → INGESTOR_CONFIG DI token
    │   ├── env.schema.test.ts
    │   └── config.module.ts
    ├── nats/
    │   ├── nats.service.ts              # connect, publishContract, publishRaw, disconnect
    │   └── nats.module.ts
    ├── mock/
    │   ├── chaos-mode.ts                # const ChaosMode = { … } as const
    │   ├── chaos-state.service.ts       # Map<AssetId, ChaosState>
    │   ├── chaos-state.service.test.ts
    │   ├── random-walk.ts               # pure: nextPrice(prev, { volatilityPct, rand })
    │   ├── random-walk.test.ts
    │   ├── tick-generator.service.ts    # setInterval, per-tick mode dispatch
    │   ├── tick-generator.service.test.ts
    │   └── mock.module.ts
    └── admin/
        ├── asset-param.pipe.ts          # Zod-validated :asset path param
        ├── admin.controller.ts
        ├── admin.controller.test.ts
        └── admin.module.ts
```

## Chaos state model

A single Nest singleton (`ChaosStateService`) holds the per-asset chaos state in a `Map<AssetId, ChaosState>`, initialized to `healthy` for both `btc` and `eth` at boot.

```typescript
type ChaosState =
  | { mode: 'healthy'; since: Millis }
  | { mode: 'disconnected'; since: Millis }
  | { mode: 'stale'; since: Millis; frozenPrice: Price; frozenSourceTimestamp: Millis }
  | { mode: 'malformed'; since: Millis };
```

Modes are mutually exclusive per asset. Transitions:

- `setDisconnected(asset, now)` → replaces state with `{ mode: 'disconnected', since: now }`. Idempotent: if already `disconnected`, `since` is **not** updated; same instance returned.
- `setStale(asset, now, frozenPrice, frozenSourceTimestamp)` → snapshot supplied by the caller (admin controller pulls it from `TickGeneratorService.lastPublished(asset)`). If already `stale`, no-op.
- `setMalformed(asset, now)` → idempotent.
- `reset(asset, now)` → `{ mode: 'healthy', since: now }`. Idempotent.
- `resetAll(now)` → both assets to `healthy`.

The service exposes a read-only `get(asset): ChaosState` and `snapshot(): { asset, state }[]` for the status endpoint.

When the admin controller is asked to enter `stale` before any healthy tick has been published, the snapshot falls back to the configured anchor price with `frozenSourceTimestamp = now`. This keeps the endpoint usable from the first second of boot.

## Tick generator

`TickGeneratorService` is a Nest service implementing `OnModuleInit` / `OnModuleDestroy`. It owns:

- A `setInterval` running every `MOCK_TICK_INTERVAL_MS` (default 250 ms).
- A private `Map<AssetId, Price>` of last published healthy prices, seeded from anchors at boot.
- A reference to `ChaosStateService` and `NatsService`.

On `onModuleInit`, the service emits the first tick for both assets immediately (after `NatsService` reports connected) and then starts the recurring interval. This satisfies the AC of "first valid tick within 100 ms of startup" independently of the configured cadence.

Per-tick algorithm (for each of `['btc', 'eth']`):

```
state = chaosState.get(asset)
correlationId = randomUUID()
headers = { 'x-correlation-id': correlationId }
now = Date.now()

switch (state.mode):
  case 'healthy':
    price = nextPrice(prevPrice[asset], { volatilityPct, rand })
    prevPrice[asset] = price
    nats.publishContract(
      TickSchema,
      ticksSubject(asset, 'mock'),
      { asset, source: 'mock', price, receivedAt: now, sourceTimestamp: now },
      { headers },
    )

  case 'disconnected':
    return  // no publish

  case 'stale':
    nats.publishContract(
      TickSchema,
      ticksSubject(asset, 'mock'),
      { asset, source: 'mock', price: state.frozenPrice, receivedAt: now,
        sourceTimestamp: state.frozenSourceTimestamp },
      { headers },
    )

  case 'malformed':
    nats.publishRaw(
      ticksSubject(asset, 'mock'),
      JSON.stringify({ asset, source: 'mock', price: null, receivedAt: now }),
      { headers },
    )
```

`publishContract` validates against the supplied schema before encoding — this guarantees the `healthy` and `stale` paths emit only Zod-valid payloads. `publishRaw` bypasses validation; it is the only call site that produces invalid payloads and is reserved for `malformed`.

`Date.now()` and `randomUUID()` live in the generator service (infrastructure) — not in a pure module — which is consistent with CLAUDE.md rule 16 (domain layer purity does not apply to thin Nest services).

## Random walk

```typescript
// random-walk.ts (pure)
type RandFn = () => number; // returns [0, 1)
type Step = { volatilityPct: number; rand: RandFn };

export function nextPrice(prev: Price, step: Step): Price {
  const delta = (step.rand() - 0.5) * 2 * step.volatilityPct;
  return prev * (1 + delta);
}
```

Pure function; `RandFn` injected so tests can drive deterministic sequences. No anchor pull — a simple unbounded walk is sufficient for a mock that runs minutes at a time. If price drifts pathologically over hours, that is a property the demo can exercise rather than hide.

## NATS adapter

`NatsService` wraps the official `nats` client:

- `onModuleInit`: connect to `NATS_URL` with reconnect enabled and exponential backoff (max 30 s).
- `onModuleDestroy`: drain and close.
- `publishContract<T>(schema, subject, payload, opts)`: validates `payload` via `schema.parse`, encodes with the NATS JSON codec, publishes with `opts.headers` applied as `Headers`.
- `publishRaw(subject, bytes, opts)`: publishes a raw byte buffer (or string) with the supplied headers — no validation. Used only by the malformed path.
- Publish failures log `warn` (`event: 'nats.publish-failed'`) and do not throw — the generator must keep pulsing.

## Admin HTTP contract

All routes are `POST` except status. Responses are JSON.

| Route                           | Body                                           | Status |
| ------------------------------- | ---------------------------------------------- | ------ |
| `POST /admin/:asset/disconnect` | `{ asset, mode: 'disconnected', since }`       | 200    |
| `POST /admin/:asset/stale`      | `{ asset, mode: 'stale', frozenPrice, since }` | 200    |
| `POST /admin/:asset/malformed`  | `{ asset, mode: 'malformed', since }`          | 200    |
| `POST /admin/:asset/reset`      | `{ asset, mode: 'healthy', since }`            | 200    |
| `POST /admin/reset-all`         | `{ states: [{ asset, mode, since }, …] }`      | 200    |
| `GET /admin/status`             | `{ states: [{ asset, mode, since }, …] }`      | 200    |
| Any route, unknown `:asset`     | Zod error envelope                             | 400    |

The `:asset` path parameter is validated by a Nest `PipeTransform` that runs `AssetId.parse` from `@price-oracle/contracts/primitives`. Unknown values fail-fast with a 400.

A repeat command on a mode that is already active returns the current state without changing `since` — the response is identical to the first call. This is what makes the admin API safe to retry from a dashboard.

## Configuration

A single config module per app (CLAUDE.md rule 11). All env vars read once at boot, Zod-validated, exposed via `INGESTOR_CONFIG` DI token.

```typescript
export const EnvSchema = z.object({
  MOCK_HTTP_PORT: z.coerce.number().int().positive().default(7401),
  MOCK_TICK_INTERVAL_MS: z.coerce.number().int().positive().default(250),
  MOCK_BTC_ANCHOR_USD: z.coerce.number().positive().default(95_000),
  MOCK_ETH_ANCHOR_USD: z.coerce.number().positive().default(3_500),
  MOCK_PRICE_VOLATILITY_PCT: z.coerce.number().nonnegative().default(0.001),
  NATS_URL: z.string().url().default('nats://localhost:4222'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
```

Invalid input → the process fails to boot.

## Logging

`pino`, JSON. Bound static fields per scope via `logger.child({ service: 'ingestor-mock' })`. Event taxonomy (CLAUDE.md rule 20):

| Level   | Events                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------ |
| `info`  | `lifecycle.start`, `lifecycle.stop`, `chaos.mode-changed`, `nats.connected`, `nats.disconnected` |
| `warn`  | `nats.publish-failed`, `nats.reconnecting`                                                       |
| `debug` | `tick.published` (high-volume; off in prod by default)                                           |

Every tick log line carries `event`, `asset`, `sourceId: 'mock'`, `correlationId`. `chaos.mode-changed` lines carry `asset`, `from`, `to`.

## Error handling

- **Zod failure on env**: process exits with code 1 at boot.
- **Zod failure on admin :asset**: 400 JSON error envelope (Nest exception filter).
- **NATS publish failure**: caught inside `NatsService.publishContract` / `publishRaw`; logged at `warn`; the interval continues. A persistent disconnect surfaces via NATS reconnect events at `warn`.
- **Schema-validated publish path**: an unexpected internal payload that fails `schema.parse` inside `publishContract` is a programmer error — logged at `error` and rethrown. This cannot be triggered by the chaos endpoints because those go through the dedicated `publishRaw` for `malformed`.

## Per-asset isolation

Every operation that mutates state (chaos transitions, last-price update, tick emission) is keyed by `AssetId`. The chaos-state service exposes only per-asset setters; the generator iterates `['btc', 'eth']` and reads/writes one slice per iteration. Property-style coverage in tests asserts that mutating `btc` never reads or writes the `eth` slice.

## Acceptance Criteria mapping

| AC (from PRO-12)                                             | Where satisfied                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First valid tick for both assets within 100 ms of startup    | `TickGeneratorService.onModuleInit` emits an immediate first tick for both assets after `NatsService` reports connected, then starts the recurring interval. Verified by `should publish a tick within 100 ms of module init`. |
| `disconnect` stops publishing for that asset only            | Tick dispatch returns early in `'disconnected'` branch; verified by `should skip publish for the disconnected asset only`.                                                                                                     |
| `stale` freezes value at last published price for that asset | `setStale` snapshots `frozenPrice` from generator's `lastPublished(asset)`; verified by `should publish frozen price for stale asset`.                                                                                         |
| `malformed` publishes payload that fails consumer Zod        | `publishRaw` emits `{ price: null }`; `TickSchema.safeParse` returns `success: false` for that payload (covered by the chaos-state + generator tests).                                                                         |
| Chaos on one asset does not affect the other                 | `should isolate state mutations across assets`.                                                                                                                                                                                |
| `reset-all` restores both assets to healthy                  | `should restore both assets on reset-all`.                                                                                                                                                                                     |
| Standard HTTP status codes, returns current effective state  | All routes return 200 with the new state; invalid `:asset` returns 400.                                                                                                                                                        |
| Idempotency                                                  | `should be idempotent on repeated command` for each mode.                                                                                                                                                                      |
| Correlation ID per tick                                      | NATS header set on every publish; verified by `should attach correlation-id header to every publish`.                                                                                                                          |

## Testing strategy

Vitest. Tests colocated as `*.test.ts`. All test descriptions start with `should …`. No dummy tests.

| File                             | Behaviors                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chaos-state.service.test.ts`    | should transition healthy→disconnected; should remain in stale when stale command is repeated (idempotent); should snapshot lastPrice when entering stale; should isolate state mutations across assets; should restore both assets on resetAll.                                                                                   |
| `random-walk.test.ts`            | should stay within volatility band for a single step; should be deterministic given the same rand sequence.                                                                                                                                                                                                                        |
| `tick-generator.service.test.ts` | should publish a tick within 100 ms of module init; should publish a healthy tick for both assets on each interval; should skip publish for the disconnected asset only; should publish frozen price for stale asset; should publish null-price payload for malformed asset; should attach correlation-id header to every publish. |
| `admin.controller.test.ts`       | should return 200 with new mode on each command; should be idempotent on repeated command; should return 400 on unknown asset; should restore both assets on reset-all; should expose current effective state on GET /admin/status.                                                                                                |
| `env.schema.test.ts`             | should apply defaults when env omitted; should fail boot on non-positive tick interval.                                                                                                                                                                                                                                            |

`NatsService` is replaced in tests by a stub that captures `{ subject, payload, headers }` per publish. No Testcontainers in this PR.

## Out of scope for this ticket

- The aggregator that consumes these subjects — Phase 3.
- A dashboard exercising the admin endpoints — Phase 5/6.
- WS-based real-exchange ingestors — PRO-13, PRO-14.
- `dev:all` orchestration script that boots mock + aggregator + dashboard together — separate ticket once the aggregator exists.

## References

- System Design §3.5 (thin module justification), §3.9 (correlation IDs), §4.5 (anomaly detector exercise via `stale`), §A.1 (NATS subjects), §A.2 (SSE envelope — downstream).
- Reference repo: `~/Workdir/touchstone-v0/apps/ingestor-mock` (module split pattern; chaos modes differ).
- CLAUDE.md rules 1, 3, 4, 5, 6, 11, 16, 19, 20.
