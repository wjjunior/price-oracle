# Price Oracle

A confidence-aware, multi-source price feed for Bitcoin and Ethereum — every price ships with a quantified trust score, and every asset stays independently observable and degradable when sources misbehave.

[![CI](https://github.com/wjjunior/price-oracle/actions/workflows/verify.yml/badge.svg)](https://github.com/wjjunior/price-oracle/actions/workflows/verify.yml)
[![Node](https://img.shields.io/badge/Node-22%20LTS-339933?style=flat&logo=node.js&logoColor=white)](./.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)

I've built price-polling services before, and the failure mode that always worried me wasn't the upstream API being _down_ — it was the API being subtly _wrong_: drifting, lagging, or repeating a stale value while every downstream consumer kept trusting the number. Lending, derivatives, and treasury operations need a price that is trustworthy _right now_, not one that was correct fifteen seconds ago. Most systems pick a single source, hope it stays healthy, and degrade silently when it doesn't.

Price Oracle is my take on the opposite posture: a feed that **quantifies its own trust**, narrates its own health, and keeps Bitcoin and Ethereum failing independently of each other.

## What it does

- **Quantified confidence** — every aggregate tick carries a confidence score combining source freshness, cross-source agreement, and coverage. Downstream consumers can gate on the score instead of trusting a bare number.
- **Per-source health FSM** — each source transitions through `HEALTHY → DEGRADED → STALE → OFFLINE` with hysteresis, so transient blips don't cause flapping.
- **Per-asset circuit breaker** — trips when confidence stays below a floor across consecutive ticks, and recovers through a half-open probe.
- **Anomaly detection** — fires on genuine price drift, not on tick-to-tick noise.
- **Per-asset isolation** — BTC and ETH are independent end to end (NATS subjects, source state, breaker FSM, audit trail, dashboard). A failing Coinbase BTC stream cannot degrade ETH; a tripped breaker on one asset never silences the other.
- **In-band observability** — a single SSE stream carries every aggregate, source-health, breaker, and audit event as it happens, with a correlation ID propagated end to end.
- **Operator dashboard** — a React 19 SPA with live data, one-click failure injection, and an AI-assisted diagnose card that explains the current state in plain language.

## Quickstart

**Prerequisites:** Node 22 LTS (`.nvmrc`), pnpm 11, Docker.

```bash
# Mock-only stable demo (no network, no secrets):
make up

# Adds the real Binance + Coinbase ingestors:
make up-full

# Real feeds only (no mock):
make up-real

# Full containerized stack (slow first build):
make up-docker

# Stop everything; keeps the Mongo volume:
make down
```

Dashboard: <http://localhost:5173> · Aggregator API: <http://localhost:7402> · Mock admin: <http://localhost:7401/admin>.

The project runs end to end **without any external secrets** — leave `ANTHROPIC_API_KEY` unset and the diagnose card falls back to a deterministic stub on the same code path. All env vars are documented in `.env.example` and validated by a per-app Zod config module at boot; the defaults are the demo posture, so copy to `.env` only to override.

## Architecture

```
 Binance WS   Coinbase WS   Mock           NATS Core (pub/sub)
     │             │          │           ┌─ ticks.<asset>.<source>
     ▼             ▼          ▼           │
 ingestor-     ingestor-   ingestor-      │
  binance       coinbase     mock ────────┘
   (NestJS)     (NestJS)   (NestJS + chaos admin API)
                                          │
                                          ▼
                                ┌──────────────────────────────┐
                                │ aggregator (hexagonal)       │
                                │  domain: source FSM, breaker │
                                │          confidence formula  │
                                │          anomaly detector    │
                                │  app:    orchestrator        │
                                │  infra:  NATS, Mongo, Anthropic
                                │  iface:  REST + SSE          │
                                └────┬────────────────────┬────┘
                                     │                    │
                              aggregates.<asset>          │
                                     │                    ▼
                                     ▼              MongoDB
                              Dashboard (SSE)    (audit + last-known)
                              React 19 + FSD
                              Vite + Tailwind v4
                              shadcn/ui + Zustand
```

The backend is TypeScript 5.4+ on Node 22 LTS — NestJS 11, NATS Core, MongoDB 7, and `pino` for structured logs.

- **`ingestor-binance` / `ingestor-coinbase`** — thin protocol adapters that map vendor WebSocket frames into `Tick` events on `ticks.<asset>.<source>`. No domain logic, no admin surface.
- **`ingestor-mock`** — a synthetic publisher with a per-asset chaos admin API (`/admin/:asset/disconnect|stale|malformed|reset`) gated behind `MOCK_ADMIN_ENABLED`. The _only_ failure-injection surface in the system.
- **`aggregator`** — the heart of the system, split fully hexagonal. Pure domain functions run on every aggregation tick (default 500 ms): source state transitions, confidence factors, weighted-median price, anomaly detection, breaker FSM. The infrastructure layer adapts NATS subscriptions, Mongo audit writes (write-fail-safe — a Mongo outage degrades history but never stops publication), and the Anthropic-backed `DiagnosePort` (with a deterministic stub selected at composition time). The interface layer exposes REST + SSE.
- **`frontend/dashboard`** — a React 19 SPA in Feature-Sliced Design. One Zustand store per business entity, keyed by `AssetId`; live data arrives over a single SSE stream, and the diagnose response renders through `react-markdown`.

## Resilience & failure injection

The interesting part of a price feed is what happens when a source goes bad, so I made that path first-class — and demoable. The mock ingestor exposes a chaos admin API; the real ingestors deliberately do not (their failures are observed, not injected, so I never reason about a fake failure):

| Action       | Mock behavior                               | Observable effect                                                                                                                 |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `disconnect` | Mock stops publishing for the asset         | Source ages to `STALE` after `STALE_AFTER_MS`; coverage drops; confidence falls; breaker trips if below floor for the trip streak |
| `stale`      | Mock publishes the same price repeatedly    | Freshness stays high but agreement degrades versus other sources; confidence drifts down                                          |
| `malformed`  | Mock publishes payloads that fail Zod parse | Aggregator drops them at the boundary; surfaces as a `warn` log + audit event                                                     |
| `reset`      | Restore the asset to a healthy random walk  | Source returns to `HEALTHY` through hysteresis; breaker recovers via half-open probe                                              |

## Design decisions

The decisions that shaped the system most:

- **NATS Core, not JetStream.** Ticks are ephemeral; the aggregator recovers `lastKnownAggregate` per asset from MongoDB's audit collection, not from an event-replay log. JetStream is a config change away if it ever earns its weight.
- **Hexagonal where the domain is, thin everywhere else.** Full ports/adapters on the aggregator (real domain — FSMs, formulas, anomaly logic). Thin NestJS modules on the ingestors (protocol adapters with no domain). No `BaseIngestor` base class — composition over inheritance.
- **Pure domain layer.** No `Date.now()`, no `Math.random()`, no I/O. Time enters as a parameter, which makes the breaker FSM property-testable with `fast-check`.
- **One shared contracts package.** Zod schemas in `@price-oracle/contracts` are the canonical types across services, exported through subpaths (no barrel) so every consumer declares which surface it depends on.
- **Composition-time diagnose adapter.** No `ANTHROPIC_API_KEY` → deterministic stub; the orchestrator code path is identical either way, so the project runs end to end with no secrets.

## Testing

```bash
pnpm test               # unit + property tests across the workspace
pnpm test:integration   # Testcontainers (NATS + Mongo)
```

Domain coverage targets behaviors, not lines: every FSM transition (source state, breaker), every confidence-formula edge (factor zeroing, fully stale, full agreement), and anomaly edge-triggering. Property tests (`fast-check`) cover breaker hysteresis and weighted-median associativity, and the route layer is exercised with `supertest`. CI runs `typecheck`, `lint`, `test`, and `actionlint` on every PR.

## Observability

Operator observability is **in-band**: the SSE stream (`/api/stream`) carries every `aggregate`, `source-health`, `breaker-state`, and `audit` envelope as it happens, and a correlation ID propagates end to end (NATS headers → aggregator `pino` logs → SSE envelope → dashboard). Cross-service debugging is `grep <correlation-id>` across the per-service JSON logs; the Mongo audit collection is the historical record.

## Scaling & what's next

Horizontal scale follows the per-asset boundary the system already enforces: shard ingestors and aggregator instances by asset, and externalize breaker state into a shared store so instances agree. Concrete next steps, with the attach points already designed for:

- **Per-asset confidence calibration.** The formula constants come from walking representative scenarios; calibrating decay window, agreement tolerance, and coverage normalization against historical data per asset is the natural next iteration.
- **OpenTelemetry** — single-operator scope today. Attach a Nest interceptor per `interface/` plus the OTel SDK alongside `pino`.
- **Prometheus `/metrics`** — the SSE stream _is_ the live metrics surface for now. Attach a `MetricsController` per service exposing `prom-client` gauges.
- **Sentry** — the `pino` `error` channel plus the audit log cover incidents today. Attach a `pino` transport mirroring `error` into Sentry.
