# Price Oracle

A confidence-aware multi-source price feed for Bitcoin and Ethereum, with operator-facing controls and observability.

[![Claude Opus 4.7](https://img.shields.io/badge/Claude-Opus%204.7-D97757?style=flat&logo=anthropic&logoColor=white)](https://www.anthropic.com/claude)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-CLI-D97757?style=flat&logo=anthropic&logoColor=white)](https://claude.com/claude-code)
[![Context7 MCP](https://img.shields.io/badge/Context7-MCP%20server-6C63FF?style=flat&logo=readthedocs&logoColor=white)](https://context7.com/)
[![Figma Design](https://img.shields.io/badge/Figma-Design-F24E1E?style=flat&logo=figma&logoColor=white)](https://www.figma.com/)
[![Figma Make](https://img.shields.io/badge/Figma%20Make-generative-A259FF?style=flat&logo=figma&logoColor=white)](https://www.figma.com/make/)
[![Notion](https://img.shields.io/badge/Notion-System%20Design-000000?style=flat&logo=notion&logoColor=white)](https://www.notion.so/)
[![Jira](https://img.shields.io/badge/Jira-PRO%20project-0052CC?style=flat&logo=jira&logoColor=white)](https://www.atlassian.com/software/jira)
[![GitHub](https://img.shields.io/badge/GitHub-PRs%20%26%20issues-181717?style=flat&logo=github&logoColor=white)](https://github.com/wjjunior/price-oracle)

## Loom walkthrough

[DEMO](https://www.loom.com/share/92d70a528b4d4cfca0d8a9238756f180)

## The friction

Lending, derivatives, and treasury operations depend on a price that is _trustworthy right now_, not a price that was correct fifteen seconds ago. Production feeds drift, disagree, fall behind, and occasionally lie. Most systems pick one source, hope it stays healthy, and silently degrade when it doesn't.

**The Fragile Data Feed** — Every aggregate tick carries a confidence score that combines source freshness, cross-source agreement, and coverage. Per-source state machines transition between `HEALTHY`, `DEGRADED`, `STALE`, and `OFFLINE` with hysteresis, and a per-asset circuit breaker trips when confidence stays below a floor across consecutive ticks. Anomalies fire on price drift, not on noise.

**Per-asset isolation** — BTC and ETH are independent throughout: NATS subjects, source state, breaker FSM, audit trail, and the dashboard. A failing Coinbase BTC stream cannot degrade ETH; a tripped breaker on one asset never silences the other.

## Architecture

```
 Binance WS  Coinbase WS  Kraken WS    Mock        NATS Core (pub/sub)
     │            │            │          │        ┌─ ticks.<asset>.<source>
     ▼            ▼            ▼          ▼        │
 ingestor-    ingestor-    ingestor-  ingestor-    │
  binance      coinbase      kraken      mock ─────┘
   (NestJS)     (NestJS)     (NestJS)  (NestJS + chaos admin API)
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

**Backend** (TypeScript 5.4+, Node 22 LTS, NestJS 11, NATS Core, MongoDB 7, pino).

- **`ingestor-binance` / `ingestor-coinbase` / `ingestor-kraken`** — thin protocol adapters mapping vendor WebSocket frames into `Tick` events on `ticks.<asset>.<source>`. No domain logic, no admin surface.
- **`ingestor-mock`** — synthetic publisher with a per-asset chaos admin API (`/admin/:asset/disconnect|stale|malformed|reset`) gated behind `MOCK_ADMIN_ENABLED`. The only failure-injection surface.
- **`aggregator`** — full hexagonal split. Pure domain functions run on every aggregation tick (default 500ms): source state transitions, confidence factors, weighted-median price, anomaly detection, breaker FSM. The infrastructure layer adapts NATS subscriptions, Mongo audit writes (write-fail-safe), and the Anthropic-backed `DiagnosePort` (with a deterministic stub fallback selected at composition time). The interface layer exposes REST + SSE.
- **`frontend/dashboard`** — React 19 SPA in Feature-Sliced Design. One Zustand store per business entity, keyed by `AssetId`. Live data flows in over a single SSE stream; the diagnose response renders through `react-markdown`.

## Key design decisions

The full decision log lives in [`decisions.md`](./decisions.md). Highlights:

- **NATS Core, not JetStream.** Ticks are ephemeral; aggregator recovers `lastKnownAggregate` per asset from MongoDB's audit collection, not from an event replay log. JetStream is a config change away if it ever earns its weight.
- **Hexagonal hybrid.** Full ports/adapters on the aggregator (because it has real domain — FSMs, formulas, anomaly logic). Thin NestJS modules on the ingestors (because they are protocol adapters with no domain).
- **Pure domain layer.** No `Date.now()`, no `Math.random()`, no I/O. Time enters as a parameter. The breaker FSM is property-tested with `fast-check`.
- **Single shared contracts package.** Zod schemas in `@price-oracle/contracts` are the canonical types across services. Subpath exports (no barrel) so every consumer declares which surface it depends on.
- **Mock owns the chaos surface.** Real ingestors fail _for real_ (network, rate-limit, malformed frame). Synthetic failures are injected only on the mock so we never observe a fake failure.
- **Composition-time diagnose adapter.** No `ANTHROPIC_API_KEY` → deterministic stub; the orchestrator code path is identical in both modes. The project runs end-to-end with no secrets.

## Running locally

**Prerequisites:** Node 22 LTS (`.nvmrc`), pnpm 11, Docker.

```bash
# Mock-only stable demo (no network, no secrets):
make up

# Adds real Binance + Coinbase + Kraken ingestors:
make up-full

# Real feeds only (no mock):
make up-real

# Full containerized stack (slow first build):
make up-docker

# Stop everything; keeps the Mongo volume:
make down
```

Dashboard: <http://localhost:5173> · Aggregator API: <http://localhost:7402> · Mock admin: <http://localhost:7401/admin>.

All env vars are documented in `.env.example` and validated by a per-app Zod config module at boot. The defaults are the demo posture; copy to `.env` to override.

## Chaos controls

| Action       | Mock behavior                               | Observable effect                                                                                                                 |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `disconnect` | Mock stops publishing for the asset         | Source ages to `STALE` after `STALE_AFTER_MS`; coverage drops; confidence falls; breaker trips if below floor for the trip streak |
| `stale`      | Mock publishes the same price repeatedly    | Freshness factor stays high but agreement degrades vs other sources; confidence drifts down                                       |
| `malformed`  | Mock publishes payloads that fail Zod parse | Aggregator drops them at the boundary; surfaces as `warn` log + audit event                                                       |
| `reset`      | Restore the asset to healthy random-walk    | Source returns to `HEALTHY` through hysteresis, breaker recovers via half-open probe                                              |

Real ingestors expose **no admin surface** — their failures are observed, not injected.

## Tests

```bash
pnpm test               # unit + property tests across the workspace
pnpm test:integration   # Testcontainers (NATS + Mongo)
```

Domain coverage is exhaustive: every FSM transition (source state, breaker), every confidence-formula edge (factor zeroing, fully stale, full agreement), and anomaly edge-triggering. Property tests (`fast-check`) cover breaker hysteresis and weighted-median associativity. The route layer is exercised via `supertest`. CI runs `typecheck`, `lint`, `test`, and `actionlint` on every PR.

## Observability

Live operator observability is **in-band**: the SSE stream (`/api/stream`) carries every `aggregate`, `source-health`, `breaker-state`, and `audit` envelope as it happens, and a correlation ID propagates end-to-end (NATS headers → aggregator pino logs → SSE envelope → dashboard). Cross-service debugging is `grep <correlation-id>` across the per-service pino JSON logs; the Mongo audit collection is the historical record.

Intentionally **not** here, with named attach points if scale demands it:

- **OpenTelemetry** — single-operator scope. Attach: Nest interceptor per `interface/` + OTel SDK alongside `pino`.
- **Prometheus `/metrics`** — the SSE stream _is_ the metrics surface. Attach: a `MetricsController` per service exposing `prom-client` gauges.
- **Sentry** — pino `error` channel + audit log cover incidents today. Attach: pino transport mirroring `error` to Sentry.

Full design rationale lives on the **Price Oracle → System Design** page in Notion.
