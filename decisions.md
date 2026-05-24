# Decision Log

## Entry 1

**Date:** 2026-05-21 20:46 UTC
**Decision:** Define every cross-service payload as a Zod schema in a single shared workspace package, `@price-oracle/contracts`, exposed only through narrow subpaths (`events`, `rest`, `sse`, `subjects`, `primitives`, `aggregation`). No barrel re-export at the package root.
**Owner:** Coding Agent (accepted by Candidate)
**Alternatives considered:** Hand-typed TypeScript interfaces duplicated per service; Protobuf with `protoc-gen-ts`; OpenAPI with generated clients; runtime validation only at REST boundaries with handwritten domain types elsewhere.
**Reasoning:** The Coding Agent proposed Zod as the single source of truth because the boundary-validation rule (CLAUDE.md rule 5) already required schemas; using the inferred schema as the domain type collapses two layers into one and eliminates mapper boilerplate (rule 13). I accepted the proposal because Protobuf and OpenAPI would have added a code-generation step with no payoff at this scope — there is no polyglot consumer. I added the constraint that the package must not export a barrel: I want every consumer's import to declare which surface it depends on, both for tree-shaking and for design legibility on PR diffs.

---

## Entry 2

**Date:** 2026-05-21 21:11 UTC
**Decision:** Use NATS Core (pure pub/sub) as the inter-service bus, not JetStream or any other durable broker.
**Owner:** Candidate
**Alternatives considered:** NATS JetStream, Redis Streams, Kafka, in-process EventEmitter with shared memory.
**Reasoning:** Ticks are ephemeral by design — once the aggregator has consumed and produced an aggregate, the raw tick is no longer interesting. The aggregator's recovery surface is `AuditPort` (snapshot of `lastKnownAggregate` per asset in Mongo), not an event log replay. JetStream's durability, ack semantics, and consumer groups would solve a problem we do not have, and Kafka would mean an additional broker for the reviewer to install. The architecture preserves the option to add JetStream later: subjects are already asset-parameterized (`ticks.<asset>.<source>`, `aggregates.<asset>`), so JetStream becomes a configuration change in the NATS adapter, not a rewrite.

---

## Entry 3

**Date:** 2026-05-21 22:11 UTC
**Decision:** Apply hexagonal architecture (domain / application / infrastructure / interface) only to the `aggregator`. The three ingestors stay as thin NestJS modules with one feature module per concern. ESLint enforces the dependency rule via `import/no-restricted-paths`.
**Owner:** Candidate
**Alternatives considered:** Full hexagonal on every service for uniformity; no hexagonal anywhere, with NestJS modules organized by feature for everything; a shared `BaseIngestor` class.
**Reasoning:** The aggregator carries real domain logic — source state machine with hysteresis, circuit breaker FSM, confidence formula, anomaly detection. That earns ports/adapters and full layering because the domain becomes a fast, deterministic test target with no I/O. The ingestors do not have a domain in that sense; they are protocol adapters that map a vendor payload into a `Tick` and publish to NATS. Imposing ports/adapters on them would generate symmetric boilerplate with no testability gain and would make small protocol differences (Binance multi-stream, Coinbase channel matrix) harder to read, not easier. A shared `BaseIngestor` class was rejected explicitly under CLAUDE.md rule 17 (composition over inheritance) — each ingestor implements its protocol independently and shares only the pure utilities in `@price-oracle/contracts`.

---

## Entry 4

**Date:** 2026-05-21 23:13 UTC
**Decision:** Adopt Feature-Sliced Design as the dashboard architecture (`app → pages → widgets → features → entities → shared`, strict top-down imports). Enforce the layered dependency rule and the no-cross-slice rule via `eslint-plugin-boundaries`. Each slice exposes its public surface through a single `index.ts`.
**Owner:** Candidate
**Alternatives considered:** Flat `components/` + `hooks/` + `pages/` (Create React App default); atomic design (atoms / molecules / organisms / templates); DDD-style frontend with bounded contexts and aggregates; the Next.js app-router layout adapted to Vite.
**Reasoning:** The dashboard composes three independent backend streams — REST snapshot, REST history, and an SSE pulse — into per-asset widgets that must stay isolated (BTC degrading must not re-render an ETH-only card). Without an enforced layering rule, a "PriceCard" component grows to subscribe to its own store, hit its own endpoint, and import sibling widgets, which is exactly the tangle that makes UI hard to test. FSD's top-down rule with build-time enforcement turns those drifts into ESLint failures rather than code-review catches. Atomic design solves a different problem (primitive taxonomy) and gives no story for where a Zustand store or an SSE subscription lives. The Next.js convention is overhead for a SPA with no SSR requirement.

---

## Entry 5

**Date:** 2026-05-21 23:13 UTC
**Decision:** Use Zustand for client state, with one store per business entity (`price-aggregate`, `source`, `audit-event`) co-located inside that entity's `model/` slice. No global app-store. Each per-asset store is keyed by `AssetId`, and components subscribe via narrow selectors returning primitives or stable references.
**Owner:** Candidate
**Alternatives considered:** Redux Toolkit with a single slice graph; React Context, one provider per entity; TanStack Query as the only state container; Jotai with one atom per asset.
**Reasoning:** The dashboard receives a continuous stream of per-asset SSE pulses. The non-negotiable requirement is that an update to the BTC slice must not re-render ETH-only components. Redux Toolkit could do this, but every update would flow through a single root reducer with selector memoization — possible to get right, easy to get wrong. Zustand's external store with `useStore(selector)` gives the same outcome with less ceremony, and keying by `AssetId` inside each store makes cross-asset isolation a property of the data shape rather than a discipline imposed on every selector. React Context was rejected because Context's only equality story is referential, which would re-render every subscriber on every pulse. TanStack Query alone would have worked for REST hydration but does not own the SSE stream — those events are pushes, not cached fetches, and TanStack's "query you can re-fetch" model does not fit. Spreading stores per entity, not per app, also makes each store readable in one file and keeps the FSD slice boundary meaningful.

---

## Entry 6

**Date:** 2026-05-22 00:52 UTC
**Decision:** Wire the Anthropic-backed `DiagnosePort` and a deterministic stub adapter as a composition-time selector. The orchestrator code path is identical in both cases — there is no `if (anthropicKey) { ... } else { ... }` branch at runtime.
**Owner:** Coding Agent (accepted by Candidate)
**Alternatives considered:** Throw at boot if `ANTHROPIC_API_KEY` is missing; add a runtime feature flag inside the diagnose use case; mount the stub only in tests and force the real adapter in dev.
**Reasoning:** The Coding Agent proposed adapter selection at the composition root because it preserves a hard non-functional requirement: the project must run end-to-end without external secrets, so a reviewer can `pnpm dev` blind and exercise every UI surface including the Diagnose card. I accepted the design because the alternative — a runtime feature flag — would have created a code path that does not exercise in actual demos and would have leaked "is the API key set?" knowledge into the use case, violating the boundary-validation rule (rule 5) and the "config in one module" rule (rule 11). The stub is a proper adapter that implements the same port; once you have a port-shaped abstraction, the right place for the conditional is exactly one line in the DI container.

---

## Entry 7

**Date:** 2026-05-22 00:58 UTC
**Decision:** Style the dashboard with Tailwind CSS v4 (CSS-first config via the `@theme` directive) and use shadcn/ui — Radix primitives copied into `frontend/dashboard/src/shared/ui/` as source code — instead of a packaged component library.
**Owner:** Candidate
**Alternatives considered:** Chakra UI (my first instinct); Material UI; Mantine; Radix primitives with handwritten CSS; CSS Modules with a custom design system; Tailwind v3 with the JavaScript config.
**Reasoning:** Chakra UI was the obvious starting point — comprehensive primitive set, sensible a11y defaults — but it ships as a `node_modules` package the consumer cannot edit. Visual changes go through theme overrides, and the underlying accessibility primitives are locked behind props that change shape across major versions. shadcn/ui inverts that model: Radix provides the same a11y guarantees, Tailwind provides the styling primitives, and the components themselves live in the repo as code I can edit. That maps directly onto rule 17 (composition over inheritance): the dashboard does not extend a component library, it composes primitives. Tailwind v4 specifically — over v3 — because the CSS-first config keeps theme tokens in one declarative file (`theme.css`) and removes a JavaScript indirection (`tailwind.config.js`) that no longer earns its weight under v4. The trade-off is that shadcn primitives are not version-bumped automatically; I accept that explicitly — security-relevant logic lives in Radix, which is a real package, while the visual shell is mine to maintain.

---
