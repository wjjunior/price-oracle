# Price Oracle — Claude Code Guide

A confidence-aware multi-source price feed for Bitcoin and Ethereum, with operator-facing controls and observability.

For the complete system design (architecture, decisions, rationale), consult the Notion page **Price Oracle → System Design**. This file covers the day-to-day conventions you need at hand while coding.

## Stack

**Backend:** TypeScript 5.4+, Node 22 LTS, NestJS 11, NATS Core, MongoDB 7 (official `mongodb` driver), `pino` for structured JSON logs with correlation-ID propagation.

**Frontend:** React 19, Vite, Tailwind CSS v4 (CSS-first config), shadcn/ui, Zustand, TanStack Query v5, native EventSource for SSE, `react-markdown` for the diagnose response.

**Tooling:** pnpm 11 workspaces, ESLint 9 flat config, Prettier, lefthook, Vitest, Testcontainers, `fast-check` for property tests.

Versions are pinned via `.nvmrc` (Node) and the `engines` field in the root `package.json`; deviations fail `pnpm install`.

## Repository structure

```
price-oracle/
├── apps/                  # services
│   ├── ingestor-binance/  # thin NestJS module
│   ├── ingestor-coinbase/ # thin NestJS module
│   ├── ingestor-mock/     # thin NestJS module + per-asset chaos admin API
│   └── aggregator/        # hexagonal: domain / application / infrastructure / interface
├── packages/
│   └── contracts/         # Zod schemas: events, rest, sse, primitives, subjects + pure aggregation utilities
├── frontend/
│   └── dashboard/         # Vite + React 19 + Tailwind v4, FSD layout
├── infra/                 # docker-compose.yml, nats.conf
└── test/                  # cross-service integration tests (Testcontainers)
```

Path aliases:

- `@price-oracle/contracts/events`
- `@price-oracle/contracts/primitives`
- `@price-oracle/contracts/rest`
- `@price-oracle/contracts/sse`
- `@price-oracle/contracts/subjects`

Always import from the most specific path. Do not add a barrel re-export at the package root — barrel imports defeat tree-shaking and obscure which entry point a consumer depends on.

## Backend: hexagonal hybrid

Apply hexagonal only where domain reasoning lives:

- **Full hexagonal** (`domain/`, `application/`, `infrastructure/`, `interface/`): `aggregator`
- **Thin NestJS modules:** all three ingestors

### Dependency rule (enforced by ESLint)

- `domain/` depends on nothing. Pure TS, no framework, no I/O. 100% unit-testable.
- `application/` depends on `domain/` only.
- `infrastructure/` implements `domain/` ports.
- `interface/` is the composition root, wires DI.

Reverse imports forbidden via `import/no-restricted-paths`.

### NestJS conventions

- One feature module per concern. No god modules.
- DI tokens for ports defined as constants in `domain/ports/`.
- No `@Injectable()` in `domain/` — pure classes and functions.
- `interface/` is composition root, the only place that touches every layer.

## Frontend: Feature-Sliced Design

Layers, strict top-down:

```
app → pages → widgets → features → entities → shared
```

- Higher layer imports lower; reverse forbidden.
- Cross-slice imports within a layer forbidden.
- Each slice exposes its public API via `index.ts`.
- Enforced via `eslint-plugin-boundaries`.

### Where things go

- **app/**: providers, theme (`theme.css` with Tailwind `@theme` directive), root layout
- **pages/**: route-level
- **widgets/**: composite UI blocks (price-overview, source-health, audit-timeline, diagnose-card, chaos-controls)
- **features/**: user actions (inject-failure, request-diagnose)
- **entities/**: business entities with `ui/`, `model/`, `api/` (price-aggregate, source, audit-event)
- **shared/**: generic utilities, no domain knowledge. shadcn/ui components live in `shared/ui/`.

### State and accessibility

One Zustand store per entity (`price-aggregate`, `source`, `audit-event`) exposed through that entity's `model/`; no global app-store. Stores are keyed by `AssetId` where the entity is per-asset — updating the BTC slice must not re-render ETH-only components. Subscribe via narrow selectors that return primitives or stable references (e.g., `useSourceStore((s) => s.byAsset.btc)`); never an inline object literal — it defeats Zustand's equality short-circuit. Use `subscribeWithSelector` for imperative slice access.

shadcn/ui primitives carry accessibility via Radix; do not override `aria-*` or `role` without a documented reason. Interactive widgets must be keyboard-reachable — chaos-controls in particular need focus rings and dialogs that trap focus.

## Shared contracts

All types crossing service boundaries live in `@price-oracle/contracts`:

- `events/`: NATS subject payloads (Zod schemas) — `Tick`, `AggregatePrice`
- `rest/`: REST API request/response per endpoint
- `sse/envelope.ts`: discriminated union for SSE events, tagged with `asset` where applicable
- `subjects.ts`: NATS subject builders parameterized by asset (`ticksSubject(asset, source)`, `aggregateSubject(asset)`)
- `primitives.ts`: `AssetId`, `SourceId`, `Confidence`, `Price`, `Millis`
- Pure aggregation utilities (confidence factors, weighted median) exported alongside their schemas

Schemas are the contract. If a service needs a different shape internally, transform at the boundary. Never mutate contract schemas for internal convenience.

Backend uses Zod schemas for input validation via `ZodValidationPipe`. Frontend uses inferred types; optional response validation in dev via `import.meta.env.DEV` flag.

---

## Coding rules

These are non-negotiable conventions. Apply them from the first commit.

### 1. No `any` without justification

`any` is forbidden unless accompanied by a comment explaining why no better type works. Prefer `unknown` for genuinely unknown input, narrowed via Zod parse or type guard. ESLint enforces with `@typescript-eslint/no-explicit-any`.

### 2. Named constants for domain-meaningful numbers

Numbers carrying domain meaning or appearing in more than one place become named constants. The aggregation cadence `500` becomes `AGGREGATION_INTERVAL_MS = 500`. Recovery window `30_000` becomes `BREAKER_RECOVERY_WINDOW_MS`. Trivial numbers in tests or single-use slice expressions stay inline. The rule is about communication, not constant fetishism.

### 3. No hardcoded strings for status, roles, events, or types

Discriminator values, state machine states, event types, and similar enumerations come from Zod literals or `const` objects with `as const`. Direct string comparisons like `if (state === "OPEN")` are forbidden; use the typed constant. Discriminated unions with Zod `z.literal(...)` are the preferred pattern.

### 4. Constants live near the domain that uses them

No `shared/constants.ts` dumping ground. Confidence thresholds live in `domain/confidence/`. Breaker thresholds live in `domain/breaker/`. Runtime configuration comes from a single config module per app that parses env vars via Zod at boot.

### 5. Validate at boundaries; trust types inside

Every external input passes Zod parse before becoming a TypeScript type: HTTP bodies, NATS payloads, WebSocket frames, env vars, file contents, database results that come back as `unknown`. Inside the domain, trust the type — boundary validation is the only validation needed.

The corollary: `as` assertions are a code smell anywhere. If you write `value as Foo`, ask whether the schema is wrong or whether this is a boundary that should run a Zod parse. The legitimate uses are narrow (`as const`, `satisfies`); every other use needs justification.

### 6. Explicit signatures on public APIs

Functions exported from a package, slice, or module have explicit return types. Internal functions can rely on inference if obvious. The rule is about contract clarity at boundaries, not about typing every arrow function.

### 7. One function does one thing

A function should do one thing, and its name should describe exactly what. If the name needs "and" or "then", split it. `validateAndPublishTick` becomes `validateTick` + `publishTick` with the orchestration in the caller.

### 8. No business logic in React components

Components render. Hooks orchestrate state. Business logic lives in `entities/{name}/model/` or in pure functions imported from `@price-oracle/contracts`. A component computing confidence severity or evaluating breaker state is a refactor signal.

### 9. Early return over nested conditions

Guard clauses at the top, happy path at the bottom. Nesting beyond two levels is a refactor signal. `if (!snapshot) return <Skeleton />; if (breaker === "OPEN") return <Suppressed />; return <Live data={snapshot} />` over nested ternaries.

### 10. Test signal, not coverage

Aim for 100% coverage of **behaviors**, not lines. Test density should reflect risk and complexity, not file shape.

**Declarative schemas** (Zod, type definitions, config shapes) per module:

- 1 happy path
- 1 boundary regression (strict mode, format edges, etc.)
- N tests for behaviors specific to that module's custom constraints

**Domain logic** (state machines, formulas, orchestration, business rules) gets higher coverage:

- FSMs: every transition driven by an explicit input, including anti-flapping and recovery semantics
- Formulas: a table of (inputs) → expected output pairs, edge cases at boundaries, factor zeroing
- Orchestration: behavior under degraded inputs, not just happy path
- Idempotency, error paths, retries: explicitly tested where they exist

**Do not re-prove composition.** If a primitive, utility, or constraint is proven once in its own test, do not duplicate that proof in every consumer that composes it. TypeScript catches mismatch at build time via inferred types.

Test files colocated as `*.test.ts`. Property tests as `*.property.test.ts`. Integration tests under `pnpm test:integration`, separate from default `pnpm test`.

### 11. `process.env` only in the config module

No `process.env.FOO` calls scattered across the codebase. A single config module per app reads env vars, validates with Zod, and exports a typed config object. Everywhere else imports from the config module. App fails to boot if required env vars are missing or invalid.

### 12. No sensitive data in logs

API keys, tokens, secrets never logged. Request bodies redacted before logging. Note: in this system, **prices, confidence scores, source health, breaker states, and audit events are logged** — they are the product, not sensitive. The line is around credentials, not around the operational data itself.

### 13. Use Zod-inferred types as domain types when they fit

The shared contracts in `@price-oracle/contracts` are the canonical types. The inferred Zod type **is** the domain type for entities like `Tick`, `AggregatePrice`, `AuditEvent`. Only introduce a separate domain model when the external shape genuinely disagrees with how the domain wants to work (e.g., flattening nested fields, computing derived state). Don't create mapper boilerplate for shapes that are already correct.

### 14. Adapters for external integrations

Every external integration (exchange WebSocket, NATS client, MongoDB driver, Anthropic SDK) enters the system as an adapter in `infrastructure/`, implementing a port defined in `domain/ports/`. Domain code never imports a client library directly. This is what makes the domain testable and what keeps the system flexible.

### 15. Code speaks for itself; comments are rare exceptions

Default to zero JSDoc and zero inline comments. Function names, parameter names, return types, and test descriptions carry the spec.

Comments are reserved for the narrow case where:

- The reader would not derive the meaning from the code in 5 seconds
- The information is about _why_ (decision, constraint, non-obvious quirk), not _what_ the code does
- Removing the comment would make the code harder to maintain correctly

Formula reasoning, design rationale, sensitivity-analysis justification — these live in the README or the system design document, not in code comments. Code stays clean; rationale lives where reviewers expect documentation.

Never use `/** @param ... @returns ... */` templates for trivial helpers.

### 16. Domain layer is pure

`domain/` imports nothing from framework, I/O, or async operations. No `@Injectable()`, no Promises (return synchronous results or pure generator pipelines), no client libraries, no `Date.now()`, no `Math.random()`. Time and randomness enter as parameters. Pure utility libraries like `lodash-es` are acceptable if needed — they compose functionally, which does not undermine rule 17. This is what enables 100% unit-test coverage with no mocks.

### 17. Composition over inheritance

No `class X extends Y` for code reuse. Compose via functions, ports, or strategy pattern. The system has no `BaseIngestor` class even though it has three ingestors. Each ingestor implements its protocol independently; shared utilities live in `@price-oracle/contracts`.

### 18. Rule of three before extracting

Duplication twice is acceptable. On the third occurrence, extract. Extracting after the first or second creates abstractions shaped wrong, which then resist the third use case. Prefer controlled duplication over premature abstraction.

### 19. Errors are typed, not strings

In the domain, errors are class instances or `Result<T, DomainError>` values. String errors get compared with `.includes()` or `===`, both of which break silently when the message changes. Define error types: `class BreakerOpenError extends Error`, `class StaleSourceError extends Error`. Compare via `instanceof`.

### 20. Log levels carry semantics

Log levels are a contract, not a preference. Get them right at the call site, not in a post-hoc grep.

- `debug`: granular detail useful only when reproducing a problem; off in production by default.
- `info`: state transitions and lifecycle events that the operator may want to correlate later — source health changes, breaker transitions, diagnose lifecycle, startup/shutdown.
- `warn`: recoverable boundary failures — dropped malformed payload, failed Mongo append, NATS reconnect attempt, rate-limit refusal. The system kept working; an operator may want to know.
- `error`: unhandled exceptions, crashes, and anything that would page someone in production. Use sparingly.

Every log line carries `service`, `event`, and `correlationId` when context exists, plus `asset` and `sourceId` where applicable. Bind static context once per scope with `pino` child loggers (`logger.child({ service: 'aggregator', asset })`) rather than repeating fields on every call.

---

## Naming conventions

- Files: kebab-case (`source-state.ts`)
- Types and classes: PascalCase
- Functions and variables: camelCase
- Constants: `SCREAMING_SNAKE_CASE` only for truly immutable globals (config keys, thresholds, env names). Module-level `const` with object literals stays camelCase.
- Test files: `*.test.ts` colocated with source. Property tests: `*.property.test.ts`.

## Git and PR conventions

- Commits in imperative mood: "Add breaker FSM", not "Added breaker FSM"
- One concern per commit
- PR descriptions narrative: what changed, why, what was considered and rejected

## Operational quirks

- **Asset is a first-class dimension** throughout the system. Every per-asset structure (`Map<AssetId, ...>`), every NATS subject (`ticks.<asset>.<source>`, `aggregates.<asset>`), every audit event, and every SSE envelope variant carries `asset` where applicable. Never collapse this — BTC and ETH must remain independently observable and degradable.
- **Mock ingestor admin API is dev-only.** The chaos endpoints (`/admin/:asset/disconnect`, `/admin/:asset/stale`, `/admin/:asset/malformed`, `/admin/:asset/reset`) exist only on the mock. Real ingestors expose no admin surface; their failures are observed, not injected. Disable the admin API via env flag in production.
- **Confidence formula constants come from sensitivity analysis**, not theory. Decay window, agreement tolerance, and coverage normalization were chosen by walking representative scenarios (fresh + full agreement, degraded + partial disagreement, fully stale). Per-asset calibration against historical data is documented as future work.
- **MongoDB writes are off the hot publish path.** A Mongo outage degrades the audit history but does not stop aggregate publication for any asset. `AuditPort.append()` is write-fail-safe: failures are logged at `warn` and the aggregator continues.
- **NATS Core, not JetStream** — pure pub/sub is sufficient (design §3.6). Adding JetStream later is configuration, not a rewrite.
- **Correlation IDs propagate end-to-end** via NATS message headers (ingestor → aggregator) and SSE envelopes (aggregator → dashboard). Every log line carries `service`, `event`, `asset` (where applicable), `correlationId`. The operator can reconstruct a tick's lifecycle by grepping a single ID across all process logs.
- **Anthropic stub fallback** preserves end-to-end runnability without secrets (design §3.11). The selector lives at composition time only; the orchestrator code path is identical in both cases.
- **Aggregator restart recovers** `lastKnownAggregate` per asset from `AuditPort` and serves it via `/api/snapshot?asset=...` until the first new tick arrives; per-source and breaker state reconverge naturally as ticks resume (design §7.3).

## Library and integration documentation

Before implementing against any third-party library, framework, SDK, API, CLI tool, or cloud service — even well-known ones (React, NestJS, Vite, Tailwind, shadcn/ui, Zod, Zustand, TanStack Query, NATS, the MongoDB driver, Anthropic SDK, `pino`, `fast-check`, etc.) — fetch current documentation via the **Context7 MCP server**. Training data lags releases by months; Context7 returns the version-correct API surface, configuration shape, and migration notes.

Use Context7 for API syntax, configuration, setup instructions (e.g., `pnpm dlx shadcn@latest init`, `nest new`), version migration paths, and library-specific debugging. The pattern is `resolve-library-id` → `query-docs`. Prefer Context7 over web search and over your own recall, even when you are confident.

Do **not** use Context7 for refactoring, writing scripts from scratch, debugging our own business logic, code review, or general programming concepts — those belong to the engineering process below.

## Engineering process

Implementation typically follows: write spec / refine ticket → implement against the Acceptance Criteria → manual review with refactor commits removing over-abstraction → smoke test against the local stack (`pnpm dev:infra`) → PR. Specs and ad-hoc smoke tests stay out of repo.

## When in doubt

Consult the **Price Oracle → System Design** page in Notion. It has the full rationale for every architectural decision, including alternatives considered and rejected.
