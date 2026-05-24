/**
 * @file Object factories for valid contract instances. **Test
 * scaffolding** — not part of the runtime public surface. Lives
 * under `__test-helpers__` and is consumed by tests across the
 * workspace via the package's `__test-helpers__` subpath.
 *
 * Pattern: one factory per schema. Each accepts `Partial<T>` of
 * overrides and merges them on top of a known-valid baseline.
 * Reasons this shape was chosen:
 *
 *  - Tests want to assert on small differences ("…but with `health`
 *    set to STALE"), not re-spell every field every time. The
 *    factory keeps the test focused on what is being varied.
 *
 *  - Schema evolution: adding a field to a schema requires updating
 *    one factory line instead of every test file. Tests that don't
 *    care about the new field inherit a sensible default; tests
 *    that do override it.
 *
 *  - The baseline timestamp `T` is a constant on purpose. Time is
 *    a domain input — tests should assert against fixed values, not
 *    against "approximately now". If you need different timestamps,
 *    pass overrides; do not call `Date.now()` here.
 *
 * Naming: `validX` rather than `aX` or `makeX` because the contract
 * being asserted is "this returns a *valid* X" — the factory output
 * passes Zod parse without overrides, which is itself an invariant
 * we lean on in property tests.
 */
import type {
  AggregatePrice,
  AnomalyDetected,
  BreakerStateChanged,
  DiagnoseAnswered,
  DiagnoseRequested,
  SourceState,
  SourceStateChanged,
  Tick,
} from '../events/index.js';
import type {
  GetAuditResponse,
  GetSnapshotResponse,
  PostDiagnoseRequest,
  PostDiagnoseResponse,
} from '../rest/index.js';

/**
 * Fixed wall-clock timestamp used by every factory baseline.
 * Equals 2025-05-13T00:00:00Z. The exact value is arbitrary; the
 * fact that it is constant is the point — assertions on relative
 * time (e.g. "audit `at` matches the tick's `receivedAt`") only
 * work reliably with a deterministic clock.
 */
const T = 1_747_142_400_000;

/** Build a valid `Tick` with sensible BTC/Binance defaults. */
export const validTick = (overrides: Partial<Tick> = {}): Tick => ({
  asset: 'btc',
  source: 'binance',
  price: 65_000,
  receivedAt: T,
  ...overrides,
});

/** Build a valid `AggregatePrice` with high confidence and two contributors. */
export const validAggregatePrice = (overrides: Partial<AggregatePrice> = {}): AggregatePrice => ({
  asset: 'btc',
  price: 65_000,
  confidence: 0.92,
  contributingSources: ['binance', 'coinbase'],
  computedAt: T,
  ...overrides,
});

/** Build a valid HEALTHY `SourceState` (no pending transition). */
export const validSourceState = (overrides: Partial<SourceState> = {}): SourceState => ({
  asset: 'btc',
  source: 'binance',
  health: 'HEALTHY',
  lastTickAt: T,
  lastPrice: 65_000,
  pendingHealth: null,
  pendingStreak: 0,
  ...overrides,
});

/** Build a HEALTHY→DEGRADED `SourceStateChanged` audit event. */
export const validSourceStateChanged = (
  overrides: Partial<SourceStateChanged> = {},
): SourceStateChanged => ({
  type: 'SourceStateChanged',
  asset: 'btc',
  source: 'binance',
  from: 'HEALTHY',
  to: 'DEGRADED',
  at: T,
  ...overrides,
});

/** Build a CLOSED→OPEN `BreakerStateChanged` audit event (ETH). */
export const validBreakerStateChanged = (
  overrides: Partial<BreakerStateChanged> = {},
): BreakerStateChanged => ({
  type: 'BreakerStateChanged',
  asset: 'eth',
  from: 'CLOSED',
  to: 'OPEN',
  reason: 'confidence below threshold for window',
  at: T,
  ...overrides,
});

/** Build a price-drift `AnomalyDetected` audit event (BTC, mock). */
export const validAnomalyDetected = (
  overrides: Partial<AnomalyDetected> = {},
): AnomalyDetected => ({
  type: 'AnomalyDetected',
  asset: 'btc',
  source: 'mock',
  metric: 'price-drift',
  value: 0.012,
  threshold: 0.005,
  at: T,
  ...overrides,
});

/** Build an operator-initiated `DiagnoseRequested` audit event. */
export const validDiagnoseRequested = (
  overrides: Partial<DiagnoseRequested> = {},
): DiagnoseRequested => ({
  type: 'DiagnoseRequested',
  asset: 'btc',
  trigger: 'operator-manual',
  at: T,
  ...overrides,
});

/** Build a `DiagnoseAnswered` audit event (no tokens, i.e. stub). */
export const validDiagnoseAnswered = (
  overrides: Partial<DiagnoseAnswered> = {},
): DiagnoseAnswered => ({
  type: 'DiagnoseAnswered',
  asset: 'btc',
  latencyMs: 1_234,
  at: T,
  ...overrides,
});

/** Build a healthy-state `GetSnapshotResponse` (one source, CLOSED breaker). */
export const validGetSnapshotResponse = (
  overrides: Partial<GetSnapshotResponse> = {},
): GetSnapshotResponse => ({
  asset: 'btc',
  aggregate: validAggregatePrice(),
  sources: [validSourceState()],
  breaker: 'CLOSED',
  ...overrides,
});

/** Build a `GetAuditResponse` with two example events. */
export const validGetAuditResponse = (
  overrides: Partial<GetAuditResponse> = {},
): GetAuditResponse => ({
  events: [validSourceStateChanged(), validBreakerStateChanged()],
  ...overrides,
});

/** Build a `PostDiagnoseRequest`. Empty body is valid (trigger is optional). */
export const validPostDiagnoseRequest = (
  overrides: Partial<PostDiagnoseRequest> = {},
): PostDiagnoseRequest => ({
  ...overrides,
});

/** Build a `PostDiagnoseResponse` (stub-flavored: no `tokensUsed`). */
export const validPostDiagnoseResponse = (
  overrides: Partial<PostDiagnoseResponse> = {},
): PostDiagnoseResponse => ({
  asset: 'btc',
  markdown: 'BTC confidence dropped to 0.42 after coinbase staleness exceeded 8s.',
  latencyMs: 850,
  generatedAt: T,
  ...overrides,
});
