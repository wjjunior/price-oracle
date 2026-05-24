# Price Oracle

A confidence-aware multi-source price feed for Bitcoin and Ethereum, with operator-facing controls and observability.

> The full README lands with PRO-40 (project documentation). This file currently captures only the contributor-facing CI and branch-protection guidance introduced with PRO-11, plus the demo posture below.

## Demo posture

The aggregator defaults to a **mock-only** feed (`AGGREGATOR_SOURCES=mock`): deterministic, reproducible, and runnable with no secrets or network. It produces stable high confidence with the breaker CLOSED; exercise degradation through the mock's chaos API (`disconnect`, `stale`, `malformed`).

To watch live multi-source agreement, opt into the real ingestors:

- **Real-only:** `AGGREGATOR_SOURCES=binance,coinbase`
- **Mixed (mock + real):** `AGGREGATOR_SOURCES=binance,coinbase,mock`

Mixing the mock with real sources is intended for **exercising disagreement and chaos**, not for a steady-state demo: the mock's static anchors diverge from the live market, so the agreement factor — and confidence — will sit lower by design. Real-feed source-health thresholds (`DEGRADED_AFTER_MS`, `STALE_AFTER_MS`, `FRESHNESS_DECAY_MS`) tolerate typical exchange WebSocket gaps; per-asset calibration is documented as future work.

## Observability

Live operator observability is **in-band**: the dashboard's SSE stream (`/api/stream`) carries every `aggregate`, `source-health`, `breaker-state`, and `audit` envelope as it happens, and a correlation ID propagates end-to-end (NATS headers on the ingestor → aggregator pino logs → SSE envelope → dashboard). Cross-service debugging is `grep <correlation-id>` across the per-service pino JSON logs; the Mongo audit collection is the historical record. The HTTP-exposed services (aggregator, mock ingestor) carry a cheap `GET /health` liveness probe for orchestrators.

What is intentionally **not** here:

- **OpenTelemetry traces** — single-operator scope; the correlation ID already gives request lifecycle across services without a collector. Attach point: a Nest interceptor in each `interface/` layer + an OTel SDK init alongside `pino`.
- **Prometheus `/metrics`** — the dashboard SSE _is_ the live metrics surface. Attach point: a `MetricsController` per service exposing prom-client gauges (tick rate, breaker counts, aggregate latency).
- **Sentry** — error rate is low enough that the pino `error` channel + audit log cover incidents; the dashboard surfaces them. Attach point: a pino transport mirroring `error`-level lines to Sentry.

The full design rationale lives on the **Price Oracle → System Design** page in Notion.

## Branch protection

Configure `main` under **Settings → Branches → Branch protection rules** with:

**Required status checks (must pass before merge):**

- `verify (typecheck)`
- `verify (lint)`
- `verify (test)`
- `actionlint`

**Additional rules:**

- _Require branches to be up to date before merging_ — keeps main close to linear without forcing aggressive rebases.
- _Require a pull request before merging_ with at least one approving review.
- _Restrict pushes that create matching branches_ — no direct pushes to `main`.

The workflow that produces these checks lives at `.github/workflows/verify.yml`.
