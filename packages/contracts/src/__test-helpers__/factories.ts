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

const T = 1_747_142_400_000;

export const validTick = (overrides: Partial<Tick> = {}): Tick => ({
  asset: 'btc',
  source: 'binance',
  price: 65_000,
  receivedAt: T,
  ...overrides,
});

export const validAggregatePrice = (overrides: Partial<AggregatePrice> = {}): AggregatePrice => ({
  asset: 'btc',
  price: 65_000,
  confidence: 0.92,
  contributingSources: ['binance', 'coinbase'],
  computedAt: T,
  ...overrides,
});

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

export const validDiagnoseRequested = (
  overrides: Partial<DiagnoseRequested> = {},
): DiagnoseRequested => ({
  type: 'DiagnoseRequested',
  asset: 'btc',
  trigger: 'operator-manual',
  at: T,
  ...overrides,
});

export const validDiagnoseAnswered = (
  overrides: Partial<DiagnoseAnswered> = {},
): DiagnoseAnswered => ({
  type: 'DiagnoseAnswered',
  asset: 'btc',
  latencyMs: 1_234,
  at: T,
  ...overrides,
});

export const validGetSnapshotResponse = (
  overrides: Partial<GetSnapshotResponse> = {},
): GetSnapshotResponse => ({
  asset: 'btc',
  aggregate: validAggregatePrice(),
  sources: [validSourceState()],
  breaker: 'CLOSED',
  ...overrides,
});

export const validGetAuditResponse = (
  overrides: Partial<GetAuditResponse> = {},
): GetAuditResponse => ({
  events: [validSourceStateChanged(), validBreakerStateChanged()],
  ...overrides,
});

export const validPostDiagnoseRequest = (
  overrides: Partial<PostDiagnoseRequest> = {},
): PostDiagnoseRequest => ({
  ...overrides,
});

export const validPostDiagnoseResponse = (
  overrides: Partial<PostDiagnoseResponse> = {},
): PostDiagnoseResponse => ({
  asset: 'btc',
  markdown: 'BTC confidence dropped to 0.42 after coinbase staleness exceeded 8s.',
  latencyMs: 850,
  generatedAt: T,
  ...overrides,
});
