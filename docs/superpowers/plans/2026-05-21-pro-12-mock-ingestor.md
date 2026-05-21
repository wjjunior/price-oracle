# PRO-12 Mock Ingestor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/ingestor-mock` — a thin NestJS service that publishes synthetic BTC and ETH ticks to NATS at ~250 ms cadence and exposes an idempotent admin HTTP API for per-asset chaos modes (`disconnect`, `stale`, `malformed`, `reset`, `reset-all`, `status`).

**Architecture:** One NestJS app composed of four modules — `ConfigModule` (Zod-parsed env), `NatsModule` (single connection, validating publisher + raw publisher), `MockModule` (chaos state + random walk + interval-driven generator), `AdminModule` (HTTP controller with Zod-validated `:asset` pipe). All state per-asset; modes mutually exclusive; correlation ID per tick via NATS headers.

**Tech Stack:** TypeScript 5.4+ (strict, NodeNext), NestJS 11, `nats` 2.x client, Zod 4, `pino` + `nestjs-pino`, Vitest 4, pnpm workspace.

**Runtime note (load-bearing):** Apps run via `tsx` (source, no `tsc` emit) so cross-package imports of the source-only `@price-oracle/contracts` resolve without a build step. `tsx`/esbuild does **not** emit `design:paramtypes` decorator metadata, so every NestJS constructor dependency — including class-typed ones — is wired with an explicit `@Inject(Token)`. Do not rely on type-reflection DI. `typecheck` is `tsc --noEmit`; there is no `tsc` build and no `dist/`.

**Spec reference:** `docs/superpowers/specs/2026-05-21-pro-12-mock-ingestor-design.md`. Read it first if any task is ambiguous.

**Branch:** `feat/PRO-12-mock-ingestor` (already created).

---

## File structure

Files this plan creates under `apps/ingestor-mock/`:

| Path                                      | Responsibility                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `package.json`                            | Workspace package, scripts, deps                                       |
| `tsconfig.json`                           | Extends base, enables decorators, `outDir: dist`                       |
| `vitest.config.ts`                        | Test glob, Node environment                                            |
| `src/main.ts`                             | Bootstrap: `reflect-metadata`, NestFactory, listen on `MOCK_HTTP_PORT` |
| `src/app.module.ts`                       | Composes Config / Nats / Mock / Admin modules                          |
| `src/config/env.schema.ts`                | Zod schema + `INGESTOR_CONFIG` DI token + `loadConfig()`               |
| `src/config/env.schema.test.ts`           | Defaults applied; invalid values rejected                              |
| `src/config/config.module.ts`             | Global module providing `INGESTOR_CONFIG`                              |
| `src/nats/nats.service.ts`                | Connect lifecycle, `publishContract`, `publishRaw`                     |
| `src/nats/nats.module.ts`                 | Provides `NatsService`                                                 |
| `src/mock/chaos-mode.ts`                  | `ChaosMode` const + types                                              |
| `src/mock/chaos-state.service.ts`         | Per-asset state, transitions, idempotency                              |
| `src/mock/chaos-state.service.test.ts`    | All transitions + isolation + idempotency                              |
| `src/mock/random-walk.ts`                 | Pure `nextPrice(prev, { volatilityPct, rand })`                        |
| `src/mock/random-walk.test.ts`            | Volatility band + determinism                                          |
| `src/mock/tick-generator.service.ts`      | Interval, mode dispatch, last-price memory                             |
| `src/mock/tick-generator.service.test.ts` | Per-mode behaviors + correlation ID                                    |
| `src/mock/mock.module.ts`                 | Provides `ChaosStateService`, `TickGeneratorService`                   |
| `src/admin/asset-param.pipe.ts`           | Nest `PipeTransform` validating `:asset` with `AssetId.parse`          |
| `src/admin/admin.controller.ts`           | Six routes + idempotent response shape                                 |
| `src/admin/admin.controller.test.ts`      | All routes, idempotency, 400 on bad asset                              |
| `src/admin/admin.module.ts`               | Provides controller + pipe                                             |

Workspace-level edits: none expected — `apps/*` is already in `pnpm-workspace.yaml`.

---

## Task 1: Scaffold the app package

**Files:**

- Create: `apps/ingestor-mock/package.json`
- Create: `apps/ingestor-mock/tsconfig.json`
- Create: `apps/ingestor-mock/vitest.config.ts`
- Create: `apps/ingestor-mock/src/main.ts` (placeholder)

- [ ] **Step 1.1: Create `apps/ingestor-mock/package.json`**

```json
{
  "name": "@price-oracle/ingestor-mock",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "start": "tsx src/main.ts",
    "start:dev": "tsx watch src/main.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@price-oracle/contracts": "workspace:*",
    "nats": "^2.29.0",
    "nestjs-pino": "^4.4.0",
    "pino": "^9.5.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@nestjs/testing": "^11.0.0",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^4.1.6"
  }
}
```

- [ ] **Step 1.2: Create `apps/ingestor-mock/tsconfig.json`**

NestJS decorators require `experimentalDecorators` + `emitDecoratorMetadata`. Override `verbatimModuleSyntax` from base (incompatible with decorator reflection). No `rootDir`/`outDir`: this app is typechecked only (`tsc --noEmit`) and run via `tsx`; setting a `rootDir` would make `tsc` reject the cross-package `@price-oracle/contracts` source imports (TS6059, "not under rootDir").

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "verbatimModuleSyntax": false
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 1.3: Create `apps/ingestor-mock/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 1.4: Create placeholder `src/main.ts`** so tsc has something to compile

```typescript
import 'reflect-metadata';

async function bootstrap(): Promise<void> {
  // Replaced in Task 8.
}

void bootstrap();
```

- [ ] **Step 1.5: Install dependencies**

Run: `pnpm install`
Expected: pnpm hoists the new app, lockfile updates, no errors.

- [ ] **Step 1.6: Verify scaffolding builds**

Run: `pnpm --filter @price-oracle/ingestor-mock typecheck && pnpm --filter @price-oracle/ingestor-mock test`
Expected: typecheck passes; vitest reports "no tests" but exits 0 due to `--passWithNoTests`.

- [ ] **Step 1.7: Commit**

```bash
git add apps/ingestor-mock/ pnpm-lock.yaml
git commit -m "chore(PRO-12): scaffold ingestor-mock package"
```

---

## Task 2: Pure random walk

**Files:**

- Create: `apps/ingestor-mock/src/mock/random-walk.ts`
- Test: `apps/ingestor-mock/src/mock/random-walk.test.ts`

- [ ] **Step 2.1: Write the failing tests**

```typescript
// apps/ingestor-mock/src/mock/random-walk.test.ts
import { describe, expect, it } from 'vitest';

import { nextPrice } from './random-walk.js';

describe('nextPrice', () => {
  it('should stay within volatility band for a single step', () => {
    const prev = 100;
    const volatilityPct = 0.01;
    const upper = prev * (1 + volatilityPct);
    const lower = prev * (1 - volatilityPct);

    for (let i = 0; i < 1000; i += 1) {
      const result = nextPrice(prev, { volatilityPct, rand: Math.random });
      expect(result).toBeGreaterThanOrEqual(lower);
      expect(result).toBeLessThanOrEqual(upper);
    }
  });

  it('should be deterministic given the same rand sequence', () => {
    const seq = [0.1, 0.9, 0.5];
    let i = 0;
    const rand = (): number => seq[i++ % seq.length]!;
    const a = nextPrice(100, { volatilityPct: 0.01, rand });
    i = 0;
    const b = nextPrice(100, { volatilityPct: 0.01, rand });
    expect(a).toBe(b);
  });

  it('should return prev when rand returns 0.5 (no delta)', () => {
    const result = nextPrice(100, { volatilityPct: 0.01, rand: () => 0.5 });
    expect(result).toBe(100);
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: FAIL — cannot find module `./random-walk.js`.

- [ ] **Step 2.3: Implement `random-walk.ts`**

```typescript
// apps/ingestor-mock/src/mock/random-walk.ts
import type { Price } from '@price-oracle/contracts/primitives';

export type RandFn = () => number;

export interface Step {
  readonly volatilityPct: number;
  readonly rand: RandFn;
}

export const nextPrice = (prev: Price, step: Step): Price => {
  const delta = (step.rand() - 0.5) * 2 * step.volatilityPct;
  return prev * (1 + delta);
};
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: PASS (3 tests).

- [ ] **Step 2.5: Commit**

```bash
git add apps/ingestor-mock/src/mock/random-walk.ts apps/ingestor-mock/src/mock/random-walk.test.ts
git commit -m "feat(PRO-12): add pure random walk for synthetic prices"
```

---

## Task 3: Chaos mode constants

**Files:**

- Create: `apps/ingestor-mock/src/mock/chaos-mode.ts`

This task has no test of its own — the constants are consumed by `chaos-state.service.ts` in Task 4, which covers them.

- [ ] **Step 3.1: Create `chaos-mode.ts`**

```typescript
// apps/ingestor-mock/src/mock/chaos-mode.ts
import type { Millis, Price } from '@price-oracle/contracts/primitives';

export const ChaosMode = {
  HEALTHY: 'healthy',
  DISCONNECTED: 'disconnected',
  STALE: 'stale',
  MALFORMED: 'malformed',
} as const;

export type ChaosMode = (typeof ChaosMode)[keyof typeof ChaosMode];

export type ChaosState =
  | { readonly mode: typeof ChaosMode.HEALTHY; readonly since: Millis }
  | { readonly mode: typeof ChaosMode.DISCONNECTED; readonly since: Millis }
  | {
      readonly mode: typeof ChaosMode.STALE;
      readonly since: Millis;
      readonly frozenPrice: Price;
      readonly frozenSourceTimestamp: Millis;
    }
  | { readonly mode: typeof ChaosMode.MALFORMED; readonly since: Millis };
```

- [ ] **Step 3.2: Verify typecheck**

Run: `pnpm --filter @price-oracle/ingestor-mock typecheck`
Expected: PASS.

- [ ] **Step 3.3: Commit**

```bash
git add apps/ingestor-mock/src/mock/chaos-mode.ts
git commit -m "feat(PRO-12): define ChaosMode discriminated union"
```

---

## Task 4: ChaosStateService

**Files:**

- Create: `apps/ingestor-mock/src/mock/chaos-state.service.ts`
- Test: `apps/ingestor-mock/src/mock/chaos-state.service.test.ts`

- [ ] **Step 4.1: Write the failing tests**

```typescript
// apps/ingestor-mock/src/mock/chaos-state.service.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

import { ChaosMode } from './chaos-mode.js';
import { ChaosStateService } from './chaos-state.service.js';

describe('ChaosStateService', () => {
  let svc: ChaosStateService;

  beforeEach(() => {
    svc = new ChaosStateService();
  });

  it('should initialize both assets as healthy', () => {
    expect(svc.get('btc').mode).toBe(ChaosMode.HEALTHY);
    expect(svc.get('eth').mode).toBe(ChaosMode.HEALTHY);
  });

  it('should transition healthy to disconnected', () => {
    svc.setDisconnected('btc', 1_000);
    expect(svc.get('btc')).toEqual({ mode: ChaosMode.DISCONNECTED, since: 1_000 });
  });

  it('should remain in disconnected when setDisconnected called twice (idempotent since unchanged)', () => {
    svc.setDisconnected('btc', 1_000);
    svc.setDisconnected('btc', 2_000);
    expect(svc.get('btc')).toEqual({ mode: ChaosMode.DISCONNECTED, since: 1_000 });
  });

  it('should snapshot price and source timestamp when entering stale', () => {
    svc.setStale('btc', 1_500, 95_000, 1_400);
    expect(svc.get('btc')).toEqual({
      mode: ChaosMode.STALE,
      since: 1_500,
      frozenPrice: 95_000,
      frozenSourceTimestamp: 1_400,
    });
  });

  it('should keep original snapshot when setStale called twice', () => {
    svc.setStale('btc', 1_500, 95_000, 1_400);
    svc.setStale('btc', 2_500, 96_000, 2_400);
    expect(svc.get('btc')).toEqual({
      mode: ChaosMode.STALE,
      since: 1_500,
      frozenPrice: 95_000,
      frozenSourceTimestamp: 1_400,
    });
  });

  it('should transition to malformed', () => {
    svc.setMalformed('eth', 3_000);
    expect(svc.get('eth')).toEqual({ mode: ChaosMode.MALFORMED, since: 3_000 });
  });

  it('should reset an asset back to healthy', () => {
    svc.setDisconnected('btc', 1_000);
    svc.reset('btc', 5_000);
    expect(svc.get('btc')).toEqual({ mode: ChaosMode.HEALTHY, since: 5_000 });
  });

  it('should isolate state mutations across assets', () => {
    svc.setStale('btc', 1_000, 95_000, 900);
    expect(svc.get('eth').mode).toBe(ChaosMode.HEALTHY);
    svc.setMalformed('eth', 2_000);
    expect(svc.get('btc').mode).toBe(ChaosMode.STALE);
  });

  it('should restore both assets to healthy on resetAll', () => {
    svc.setDisconnected('btc', 1_000);
    svc.setMalformed('eth', 1_500);
    svc.resetAll(9_000);
    expect(svc.get('btc')).toEqual({ mode: ChaosMode.HEALTHY, since: 9_000 });
    expect(svc.get('eth')).toEqual({ mode: ChaosMode.HEALTHY, since: 9_000 });
  });

  it('should return both assets in snapshot()', () => {
    svc.setDisconnected('btc', 1_000);
    const snap = svc.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap.find((s) => s.asset === 'btc')?.state.mode).toBe(ChaosMode.DISCONNECTED);
    expect(snap.find((s) => s.asset === 'eth')?.state.mode).toBe(ChaosMode.HEALTHY);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: FAIL — cannot find module `./chaos-state.service.js`.

- [ ] **Step 4.3: Implement `chaos-state.service.ts`**

```typescript
// apps/ingestor-mock/src/mock/chaos-state.service.ts
import { Injectable } from '@nestjs/common';

import type { AssetId, Millis, Price } from '@price-oracle/contracts/primitives';

import { ChaosMode, type ChaosState } from './chaos-mode.js';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];
const INITIAL_TIME: Millis = 0;

@Injectable()
export class ChaosStateService {
  private readonly states: Record<AssetId, ChaosState> = {
    btc: { mode: ChaosMode.HEALTHY, since: INITIAL_TIME },
    eth: { mode: ChaosMode.HEALTHY, since: INITIAL_TIME },
  };

  get(asset: AssetId): ChaosState {
    return this.states[asset];
  }

  setDisconnected(asset: AssetId, now: Millis): void {
    if (this.states[asset].mode === ChaosMode.DISCONNECTED) return;
    this.states[asset] = { mode: ChaosMode.DISCONNECTED, since: now };
  }

  setStale(asset: AssetId, now: Millis, frozenPrice: Price, frozenSourceTimestamp: Millis): void {
    if (this.states[asset].mode === ChaosMode.STALE) return;
    this.states[asset] = {
      mode: ChaosMode.STALE,
      since: now,
      frozenPrice,
      frozenSourceTimestamp,
    };
  }

  setMalformed(asset: AssetId, now: Millis): void {
    if (this.states[asset].mode === ChaosMode.MALFORMED) return;
    this.states[asset] = { mode: ChaosMode.MALFORMED, since: now };
  }

  reset(asset: AssetId, now: Millis): void {
    if (this.states[asset].mode === ChaosMode.HEALTHY) return;
    this.states[asset] = { mode: ChaosMode.HEALTHY, since: now };
  }

  resetAll(now: Millis): void {
    for (const asset of ASSETS) this.reset(asset, now);
  }

  snapshot(): Array<{ asset: AssetId; state: ChaosState }> {
    return ASSETS.map((asset) => ({ asset, state: this.states[asset] }));
  }
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: PASS (10 tests in chaos-state + 3 in random-walk = 13 total).

- [ ] **Step 4.5: Commit**

```bash
git add apps/ingestor-mock/src/mock/chaos-state.service.ts apps/ingestor-mock/src/mock/chaos-state.service.test.ts
git commit -m "feat(PRO-12): add ChaosStateService with per-asset transitions"
```

---

## Task 5: Config module (Zod env)

**Files:**

- Create: `apps/ingestor-mock/src/config/env.schema.ts`
- Create: `apps/ingestor-mock/src/config/config.module.ts`
- Test: `apps/ingestor-mock/src/config/env.schema.test.ts`

- [ ] **Step 5.1: Write the failing tests**

```typescript
// apps/ingestor-mock/src/config/env.schema.test.ts
import { describe, expect, it } from 'vitest';

import { loadConfig } from './env.schema.js';

describe('loadConfig', () => {
  it('should apply defaults when env is empty', () => {
    const cfg = loadConfig({});
    expect(cfg.MOCK_HTTP_PORT).toBe(7401);
    expect(cfg.MOCK_TICK_INTERVAL_MS).toBe(250);
    expect(cfg.MOCK_BTC_ANCHOR_USD).toBe(95_000);
    expect(cfg.MOCK_ETH_ANCHOR_USD).toBe(3_500);
    expect(cfg.MOCK_PRICE_VOLATILITY_PCT).toBe(0.001);
    expect(cfg.NATS_URL).toBe('nats://localhost:4222');
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  it('should coerce numeric strings from env vars', () => {
    const cfg = loadConfig({
      MOCK_HTTP_PORT: '8080',
      MOCK_TICK_INTERVAL_MS: '100',
    });
    expect(cfg.MOCK_HTTP_PORT).toBe(8080);
    expect(cfg.MOCK_TICK_INTERVAL_MS).toBe(100);
  });

  it('should fail boot on non-positive tick interval', () => {
    expect(() => loadConfig({ MOCK_TICK_INTERVAL_MS: '0' })).toThrow();
    expect(() => loadConfig({ MOCK_TICK_INTERVAL_MS: '-5' })).toThrow();
  });

  it('should fail boot on invalid NATS_URL', () => {
    expect(() => loadConfig({ NATS_URL: 'not-a-url' })).toThrow();
  });

  it('should fail boot on unknown LOG_LEVEL', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'trace' })).toThrow();
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: FAIL — cannot find module `./env.schema.js`.

- [ ] **Step 5.3: Implement `env.schema.ts`**

```typescript
// apps/ingestor-mock/src/config/env.schema.ts
import { z } from 'zod';

export const INGESTOR_CONFIG = 'INGESTOR_CONFIG';

export const EnvSchema = z.object({
  MOCK_HTTP_PORT: z.coerce.number().int().positive().default(7401),
  MOCK_TICK_INTERVAL_MS: z.coerce.number().int().positive().default(250),
  MOCK_BTC_ANCHOR_USD: z.coerce.number().positive().default(95_000),
  MOCK_ETH_ANCHOR_USD: z.coerce.number().positive().default(3_500),
  MOCK_PRICE_VOLATILITY_PCT: z.coerce.number().nonnegative().default(0.001),
  NATS_URL: z.url().default('nats://localhost:4222'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type IngestorConfig = z.infer<typeof EnvSchema>;

export const loadConfig = (env: Record<string, string | undefined>): IngestorConfig =>
  EnvSchema.parse(env);
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: PASS (5 new tests).

- [ ] **Step 5.5: Implement `config.module.ts`**

```typescript
// apps/ingestor-mock/src/config/config.module.ts
import { Global, Module } from '@nestjs/common';

import { INGESTOR_CONFIG, loadConfig } from './env.schema.js';

@Global()
@Module({
  providers: [
    {
      provide: INGESTOR_CONFIG,
      useFactory: () => loadConfig(process.env),
    },
  ],
  exports: [INGESTOR_CONFIG],
})
export class ConfigModule {}
```

- [ ] **Step 5.6: Verify typecheck**

Run: `pnpm --filter @price-oracle/ingestor-mock typecheck`
Expected: PASS.

- [ ] **Step 5.7: Commit**

```bash
git add apps/ingestor-mock/src/config/
git commit -m "feat(PRO-12): add Zod-validated config module"
```

---

## Task 6: NATS adapter

**Files:**

- Create: `apps/ingestor-mock/src/nats/nats.service.ts`
- Create: `apps/ingestor-mock/src/nats/nats.module.ts`

No direct unit tests — the tick generator tests in Task 7 inject a stub that satisfies the same interface. This service is mostly NATS client plumbing.

- [ ] **Step 6.1: Implement `nats.service.ts`**

```typescript
// apps/ingestor-mock/src/nats/nats.service.ts
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, DebugEvents, Events, headers as natsHeaders, type NatsConnection } from 'nats';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';

import type { z } from 'zod';

const RECONNECT_TIME_WAIT_MS = 1_000;

export interface PublishOptions {
  readonly headers?: Readonly<Record<string, string>>;
}

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name);
  private connection: NatsConnection | null = null;
  private readonly encoder = new TextEncoder();

  constructor(@Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig) {}

  async onModuleInit(): Promise<void> {
    this.connection = await connect({
      servers: this.config.NATS_URL,
      reconnect: true,
      reconnectTimeWait: RECONNECT_TIME_WAIT_MS,
      maxReconnectAttempts: -1,
    });
    this.logger.log({ event: 'nats.connected', url: this.config.NATS_URL });
    void this.watchStatus();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connection) return;
    await this.connection.drain();
    this.connection = null;
  }

  publishContract<T>(
    schema: z.ZodType<T>,
    subject: string,
    payload: T,
    opts: PublishOptions = {},
  ): void {
    const validated = schema.parse(payload);
    this.publishBytes(subject, this.encoder.encode(JSON.stringify(validated)), opts);
  }

  publishRaw(subject: string, body: string, opts: PublishOptions = {}): void {
    this.publishBytes(subject, this.encoder.encode(body), opts);
  }

  private publishBytes(subject: string, bytes: Uint8Array, opts: PublishOptions): void {
    if (!this.connection) {
      this.logger.warn({ event: 'nats.publish-failed', reason: 'not-connected', subject });
      return;
    }
    try {
      const hdrs = opts.headers ? natsHeaders() : undefined;
      if (hdrs && opts.headers) {
        for (const [k, v] of Object.entries(opts.headers)) hdrs.set(k, v);
      }
      this.connection.publish(subject, bytes, hdrs ? { headers: hdrs } : undefined);
    } catch (err) {
      this.logger.warn({
        event: 'nats.publish-failed',
        subject,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async watchStatus(): Promise<void> {
    if (!this.connection) return;
    for await (const status of this.connection.status()) {
      if (status.type === Events.Disconnect || status.type === DebugEvents.Reconnecting) {
        this.logger.warn({ event: `nats.${status.type}`, data: status.data });
      } else if (status.type === Events.Reconnect) {
        this.logger.log({ event: 'nats.reconnected' });
      }
    }
  }
}
```

> Implementer note: the nats client's default reconnect behavior is sufficient for the prototype. If a strict 30 s cap is required later, pass a `reconnectDelayHandler` to `connect()`.

- [ ] **Step 6.2: Implement `nats.module.ts`**

```typescript
// apps/ingestor-mock/src/nats/nats.module.ts
import { Module } from '@nestjs/common';

import { NatsService } from './nats.service.js';

@Module({
  providers: [NatsService],
  exports: [NatsService],
})
export class NatsModule {}
```

- [ ] **Step 6.3: Verify typecheck**

Run: `pnpm --filter @price-oracle/ingestor-mock typecheck`
Expected: PASS.

- [ ] **Step 6.4: Commit**

```bash
git add apps/ingestor-mock/src/nats/
git commit -m "feat(PRO-12): add NATS adapter with validating and raw publishers"
```

---

## Task 7: TickGeneratorService

**Files:**

- Create: `apps/ingestor-mock/src/mock/tick-generator.service.ts`
- Create: `apps/ingestor-mock/src/mock/mock.module.ts`
- Test: `apps/ingestor-mock/src/mock/tick-generator.service.test.ts`

The generator is the most behavior-rich component. Tests inject a fake NatsService that captures publishes.

- [ ] **Step 7.1: Write the failing tests**

```typescript
// apps/ingestor-mock/src/mock/tick-generator.service.test.ts
import { TickSchema } from '@price-oracle/contracts/events';
import { ticksSubject } from '@price-oracle/contracts/subjects';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type IngestorConfig } from '../config/env.schema.js';
import { type NatsService, type PublishOptions } from '../nats/nats.service.js';

import { ChaosStateService } from './chaos-state.service.js';
import { TickGeneratorService } from './tick-generator.service.js';

import type { z } from 'zod';

type Captured =
  | {
      kind: 'contract';
      schema: z.ZodType<unknown>;
      subject: string;
      payload: unknown;
      headers: Readonly<Record<string, string>> | undefined;
    }
  | {
      kind: 'raw';
      subject: string;
      body: string;
      headers: Readonly<Record<string, string>> | undefined;
    };

const buildFakeNats = (): { fake: NatsService; captured: Captured[] } => {
  const captured: Captured[] = [];
  const fake = {
    publishContract: vi.fn(
      (
        schema: z.ZodType<unknown>,
        subject: string,
        payload: unknown,
        opts: PublishOptions = {},
      ) => {
        captured.push({ kind: 'contract', schema, subject, payload, headers: opts.headers });
      },
    ),
    publishRaw: vi.fn((subject: string, body: string, opts: PublishOptions = {}) => {
      captured.push({ kind: 'raw', subject, body, headers: opts.headers });
    }),
  } as unknown as NatsService;
  return { fake, captured };
};

const buildConfig = (overrides: Partial<IngestorConfig> = {}): IngestorConfig => ({
  MOCK_HTTP_PORT: 7401,
  MOCK_TICK_INTERVAL_MS: 250,
  MOCK_BTC_ANCHOR_USD: 95_000,
  MOCK_ETH_ANCHOR_USD: 3_500,
  MOCK_PRICE_VOLATILITY_PCT: 0.001,
  NATS_URL: 'nats://localhost:4222',
  LOG_LEVEL: 'info',
  ...overrides,
});

describe('TickGeneratorService', () => {
  let chaos: ChaosStateService;
  let nats: NatsService;
  let captured: Captured[];
  let svc: TickGeneratorService;

  beforeEach(() => {
    vi.useFakeTimers();
    chaos = new ChaosStateService();
    const built = buildFakeNats();
    nats = built.fake;
    captured = built.captured;
    svc = new TickGeneratorService(buildConfig(), nats, chaos);
  });

  afterEach(() => {
    svc.onModuleDestroy();
    vi.useRealTimers();
  });

  it('should publish a tick for both assets within 100 ms of module init', async () => {
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(50);
    const subjects = captured.map((c) => c.subject);
    expect(subjects).toContain(ticksSubject('btc', 'mock'));
    expect(subjects).toContain(ticksSubject('eth', 'mock'));
  });

  it('should publish a healthy tick for both assets on each interval', async () => {
    svc.onModuleInit();
    captured.length = 0;
    await vi.advanceTimersByTimeAsync(250);
    expect(captured.filter((c) => c.subject === ticksSubject('btc', 'mock'))).toHaveLength(1);
    expect(captured.filter((c) => c.subject === ticksSubject('eth', 'mock'))).toHaveLength(1);
  });

  it('should skip publish for the disconnected asset only', async () => {
    svc.onModuleInit();
    captured.length = 0;
    chaos.setDisconnected('btc', Date.now());
    await vi.advanceTimersByTimeAsync(250);
    expect(captured.find((c) => c.subject === ticksSubject('btc', 'mock'))).toBeUndefined();
    expect(captured.find((c) => c.subject === ticksSubject('eth', 'mock'))).toBeDefined();
  });

  it('should publish frozen price for stale asset', async () => {
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(250);
    const lastBtc = svc.lastPublished('btc');
    expect(lastBtc).not.toBeNull();
    chaos.setStale('btc', Date.now(), lastBtc!.price, lastBtc!.sourceTimestamp);
    captured.length = 0;
    await vi.advanceTimersByTimeAsync(750);
    const btcPublishes = captured.filter(
      (c): c is Extract<Captured, { kind: 'contract' }> =>
        c.kind === 'contract' && c.subject === ticksSubject('btc', 'mock'),
    );
    expect(btcPublishes.length).toBeGreaterThanOrEqual(2);
    for (const p of btcPublishes) {
      const parsed = TickSchema.parse(p.payload);
      expect(parsed.price).toBe(lastBtc!.price);
      expect(parsed.sourceTimestamp).toBe(lastBtc!.sourceTimestamp);
    }
  });

  it('should publish null-price payload via publishRaw for malformed asset', async () => {
    svc.onModuleInit();
    chaos.setMalformed('eth', Date.now());
    captured.length = 0;
    await vi.advanceTimersByTimeAsync(250);
    const ethPublish = captured.find((c) => c.subject === ticksSubject('eth', 'mock'));
    expect(ethPublish).toBeDefined();
    expect(ethPublish!.kind).toBe('raw');
    const body = JSON.parse((ethPublish as Extract<Captured, { kind: 'raw' }>).body) as Record<
      string,
      unknown
    >;
    expect(body.price).toBeNull();
    const validation = TickSchema.safeParse(body);
    expect(validation.success).toBe(false);
  });

  it('should attach a correlation-id header to every publish', async () => {
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(500);
    expect(captured.length).toBeGreaterThan(0);
    for (const c of captured) {
      expect(c.headers?.['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
```

- [ ] **Step 7.2: Run tests to verify they fail**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: FAIL — cannot find module `./tick-generator.service.js`.

- [ ] **Step 7.3: Implement `tick-generator.service.ts`**

```typescript
// apps/ingestor-mock/src/mock/tick-generator.service.ts
import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TickSchema } from '@price-oracle/contracts/events';
import { type AssetId, type Millis, type Price } from '@price-oracle/contracts/primitives';
import { ticksSubject } from '@price-oracle/contracts/subjects';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';
import { NatsService } from '../nats/nats.service.js';

import { ChaosMode } from './chaos-mode.js';
import { ChaosStateService } from './chaos-state.service.js';
import { nextPrice } from './random-walk.js';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];
const MOCK_SOURCE = 'mock' as const;
const CORRELATION_HEADER = 'x-correlation-id';

export interface LastPublished {
  readonly price: Price;
  readonly sourceTimestamp: Millis;
}

@Injectable()
export class TickGeneratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickGeneratorService.name);
  private interval: NodeJS.Timeout | null = null;
  private readonly lastPrice: Record<AssetId, Price>;
  private readonly lastTickAt: Record<AssetId, Millis> = { btc: 0, eth: 0 };

  constructor(
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
    @Inject(NatsService) private readonly nats: NatsService,
    @Inject(ChaosStateService) private readonly chaos: ChaosStateService,
  ) {
    this.lastPrice = {
      btc: config.MOCK_BTC_ANCHOR_USD,
      eth: config.MOCK_ETH_ANCHOR_USD,
    };
  }

  onModuleInit(): void {
    this.emitAll();
    this.interval = setInterval(() => this.emitAll(), this.config.MOCK_TICK_INTERVAL_MS);
    this.logger.log({
      event: 'lifecycle.start',
      intervalMs: this.config.MOCK_TICK_INTERVAL_MS,
    });
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.logger.log({ event: 'lifecycle.stop' });
  }

  lastPublished(asset: AssetId): LastPublished | null {
    if (this.lastTickAt[asset] === 0) return null;
    return { price: this.lastPrice[asset], sourceTimestamp: this.lastTickAt[asset] };
  }

  private emitAll(): void {
    const now = Date.now();
    for (const asset of ASSETS) this.emitOne(asset, now);
  }

  private emitOne(asset: AssetId, now: Millis): void {
    const state = this.chaos.get(asset);
    const correlationId = randomUUID();
    const headers = { [CORRELATION_HEADER]: correlationId };
    const subject = ticksSubject(asset, MOCK_SOURCE);

    if (state.mode === ChaosMode.DISCONNECTED) return;

    if (state.mode === ChaosMode.MALFORMED) {
      const body = JSON.stringify({ asset, source: MOCK_SOURCE, price: null, receivedAt: now });
      this.nats.publishRaw(subject, body, { headers });
      return;
    }

    if (state.mode === ChaosMode.STALE) {
      this.nats.publishContract(
        TickSchema,
        subject,
        {
          asset,
          source: MOCK_SOURCE,
          price: state.frozenPrice,
          receivedAt: now,
          sourceTimestamp: state.frozenSourceTimestamp,
        },
        { headers },
      );
      return;
    }

    const price = nextPrice(this.lastPrice[asset], {
      volatilityPct: this.config.MOCK_PRICE_VOLATILITY_PCT,
      rand: Math.random,
    });
    this.lastPrice[asset] = price;
    this.lastTickAt[asset] = now;
    this.nats.publishContract(
      TickSchema,
      subject,
      { asset, source: MOCK_SOURCE, price, receivedAt: now, sourceTimestamp: now },
      { headers },
    );
  }
}
```

- [ ] **Step 7.4: Implement `mock.module.ts`**

```typescript
// apps/ingestor-mock/src/mock/mock.module.ts
import { Module } from '@nestjs/common';

import { NatsModule } from '../nats/nats.module.js';

import { ChaosStateService } from './chaos-state.service.js';
import { TickGeneratorService } from './tick-generator.service.js';

@Module({
  imports: [NatsModule],
  providers: [ChaosStateService, TickGeneratorService],
  exports: [ChaosStateService, TickGeneratorService],
})
export class MockModule {}
```

- [ ] **Step 7.5: Run tests to verify they pass**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: PASS (6 new tests; total now ~24).

- [ ] **Step 7.6: Commit**

```bash
git add apps/ingestor-mock/src/mock/tick-generator.service.ts apps/ingestor-mock/src/mock/tick-generator.service.test.ts apps/ingestor-mock/src/mock/mock.module.ts
git commit -m "feat(PRO-12): add interval-driven tick generator with per-mode dispatch"
```

---

## Task 8: Admin module

**Files:**

- Create: `apps/ingestor-mock/src/admin/asset-param.pipe.ts`
- Create: `apps/ingestor-mock/src/admin/admin.controller.ts`
- Create: `apps/ingestor-mock/src/admin/admin.module.ts`
- Test: `apps/ingestor-mock/src/admin/admin.controller.test.ts`

- [ ] **Step 8.1: Write the failing controller tests**

```typescript
// apps/ingestor-mock/src/admin/admin.controller.test.ts
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type IngestorConfig, INGESTOR_CONFIG } from '../config/env.schema.js';
import { ChaosMode } from '../mock/chaos-mode.js';
import { ChaosStateService } from '../mock/chaos-state.service.js';
import { TickGeneratorService } from '../mock/tick-generator.service.js';
import { NatsService } from '../nats/nats.service.js';

import { AdminController } from './admin.controller.js';
import { AssetParamPipe } from './asset-param.pipe.js';

const fakeConfig: IngestorConfig = {
  MOCK_HTTP_PORT: 7401,
  MOCK_TICK_INTERVAL_MS: 250,
  MOCK_BTC_ANCHOR_USD: 95_000,
  MOCK_ETH_ANCHOR_USD: 3_500,
  MOCK_PRICE_VOLATILITY_PCT: 0.001,
  NATS_URL: 'nats://localhost:4222',
  LOG_LEVEL: 'info',
};

describe('AdminController', () => {
  let chaos: ChaosStateService;
  let generator: { lastPublished: ReturnType<typeof vi.fn> };
  let controller: AdminController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    chaos = new ChaosStateService();
    generator = {
      lastPublished: vi.fn().mockReturnValue({ price: 95_000, sourceTimestamp: 1_699_999_999_000 }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AssetParamPipe,
        { provide: ChaosStateService, useValue: chaos },
        { provide: TickGeneratorService, useValue: generator },
        { provide: INGESTOR_CONFIG, useValue: fakeConfig },
        { provide: NatsService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(AdminController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return 200 with disconnected state on POST /admin/btc/disconnect', () => {
    const res = controller.disconnect('btc');
    expect(res).toEqual({ asset: 'btc', mode: ChaosMode.DISCONNECTED, since: 1_700_000_000_000 });
    expect(chaos.get('btc').mode).toBe(ChaosMode.DISCONNECTED);
  });

  it('should be idempotent: repeated disconnect returns original since', () => {
    controller.disconnect('btc');
    vi.setSystemTime(new Date(1_700_000_001_000));
    const res = controller.disconnect('btc');
    expect(res.since).toBe(1_700_000_000_000);
  });

  it('should snapshot last published price when setting stale', () => {
    const res = controller.stale('btc');
    expect(res).toEqual({
      asset: 'btc',
      mode: ChaosMode.STALE,
      since: 1_700_000_000_000,
      frozenPrice: 95_000,
    });
    expect(generator.lastPublished).toHaveBeenCalledWith('btc');
  });

  it('should fall back to anchor price when no tick has been published yet', () => {
    generator.lastPublished.mockReturnValue(null);
    const res = controller.stale('eth');
    expect(res.frozenPrice).toBe(3_500);
  });

  it('should return malformed state on POST /admin/btc/malformed', () => {
    const res = controller.malformed('btc');
    expect(res.mode).toBe(ChaosMode.MALFORMED);
  });

  it('should reset an asset back to healthy', () => {
    controller.disconnect('btc');
    const res = controller.reset('btc');
    expect(res.mode).toBe(ChaosMode.HEALTHY);
  });

  it('should restore both assets on POST /admin/reset-all', () => {
    controller.disconnect('btc');
    controller.malformed('eth');
    const res = controller.resetAll();
    expect(res.states).toHaveLength(2);
    expect(res.states.every((s) => s.mode === ChaosMode.HEALTHY)).toBe(true);
  });

  it('should expose current effective state on GET /admin/status', () => {
    controller.disconnect('btc');
    const res = controller.status();
    expect(res.states.find((s) => s.asset === 'btc')?.mode).toBe(ChaosMode.DISCONNECTED);
    expect(res.states.find((s) => s.asset === 'eth')?.mode).toBe(ChaosMode.HEALTHY);
  });
});

describe('AssetParamPipe', () => {
  it('should return the asset when valid', () => {
    const pipe = new AssetParamPipe();
    expect(pipe.transform('btc')).toBe('btc');
    expect(pipe.transform('eth')).toBe('eth');
  });

  it('should throw 400 on unknown asset', () => {
    const pipe = new AssetParamPipe();
    expect(() => pipe.transform('sol')).toThrow();
  });
});
```

- [ ] **Step 8.2: Run tests to verify they fail**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: FAIL — cannot find modules `./admin.controller.js`, `./asset-param.pipe.js`.

- [ ] **Step 8.3: Implement `asset-param.pipe.ts`**

```typescript
// apps/ingestor-mock/src/admin/asset-param.pipe.ts
import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { AssetId } from '@price-oracle/contracts/primitives';

@Injectable()
export class AssetParamPipe implements PipeTransform<string, AssetId> {
  transform(value: string): AssetId {
    const parsed = AssetId.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_asset',
        message: `unknown asset: ${value}`,
        allowed: AssetId.options,
      });
    }
    return parsed.data;
  }
}
```

- [ ] **Step 8.4: Implement `admin.controller.ts`**

```typescript
// apps/ingestor-mock/src/admin/admin.controller.ts
import { Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { type AssetId, type Millis } from '@price-oracle/contracts/primitives';

import { INGESTOR_CONFIG, type IngestorConfig } from '../config/env.schema.js';
import { ChaosMode, type ChaosState } from '../mock/chaos-mode.js';
import { ChaosStateService } from '../mock/chaos-state.service.js';
import { TickGeneratorService } from '../mock/tick-generator.service.js';

import { AssetParamPipe } from './asset-param.pipe.js';

interface AssetStateResponse {
  readonly asset: AssetId;
  readonly mode: ChaosState['mode'];
  readonly since: Millis;
  readonly frozenPrice?: number;
}

const anchorFor = (asset: AssetId, cfg: IngestorConfig): number =>
  asset === 'btc' ? cfg.MOCK_BTC_ANCHOR_USD : cfg.MOCK_ETH_ANCHOR_USD;

const describe = (asset: AssetId, state: ChaosState): AssetStateResponse => {
  if (state.mode === ChaosMode.STALE) {
    return { asset, mode: state.mode, since: state.since, frozenPrice: state.frozenPrice };
  }
  return { asset, mode: state.mode, since: state.since };
};

@Controller('admin')
export class AdminController {
  constructor(
    @Inject(ChaosStateService) private readonly chaos: ChaosStateService,
    @Inject(TickGeneratorService) private readonly generator: TickGeneratorService,
    @Inject(INGESTOR_CONFIG) private readonly config: IngestorConfig,
  ) {}

  @Post(':asset/disconnect')
  disconnect(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    this.chaos.setDisconnected(asset, Date.now());
    return describe(asset, this.chaos.get(asset));
  }

  @Post(':asset/stale')
  stale(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    const last = this.generator.lastPublished(asset);
    const now = Date.now();
    if (last) {
      this.chaos.setStale(asset, now, last.price, last.sourceTimestamp);
    } else {
      this.chaos.setStale(asset, now, anchorFor(asset, this.config), now);
    }
    return describe(asset, this.chaos.get(asset));
  }

  @Post(':asset/malformed')
  malformed(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    this.chaos.setMalformed(asset, Date.now());
    return describe(asset, this.chaos.get(asset));
  }

  @Post(':asset/reset')
  reset(@Param('asset', AssetParamPipe) asset: AssetId): AssetStateResponse {
    this.chaos.reset(asset, Date.now());
    return describe(asset, this.chaos.get(asset));
  }

  @Post('reset-all')
  resetAll(): { states: AssetStateResponse[] } {
    this.chaos.resetAll(Date.now());
    return this.status();
  }

  @Get('status')
  status(): { states: AssetStateResponse[] } {
    return { states: this.chaos.snapshot().map(({ asset, state }) => describe(asset, state)) };
  }
}
```

- [ ] **Step 8.5: Implement `admin.module.ts`**

```typescript
// apps/ingestor-mock/src/admin/admin.module.ts
import { Module } from '@nestjs/common';

import { MockModule } from '../mock/mock.module.js';

import { AdminController } from './admin.controller.js';
import { AssetParamPipe } from './asset-param.pipe.js';

@Module({
  imports: [MockModule],
  controllers: [AdminController],
  providers: [AssetParamPipe],
})
export class AdminModule {}
```

- [ ] **Step 8.6: Run tests to verify they pass**

Run: `pnpm --filter @price-oracle/ingestor-mock test`
Expected: PASS (10 new tests; total now ~34).

- [ ] **Step 8.7: Commit**

```bash
git add apps/ingestor-mock/src/admin/
git commit -m "feat(PRO-12): add admin HTTP controller for per-asset chaos modes"
```

---

## Task 9: App bootstrap

**Files:**

- Modify: `apps/ingestor-mock/src/main.ts`
- Create: `apps/ingestor-mock/src/app.module.ts`

- [ ] **Step 9.1: Implement `app.module.ts`**

```typescript
// apps/ingestor-mock/src/app.module.ts
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AdminModule } from './admin/admin.module.js';
import { ConfigModule } from './config/config.module.js';
import { INGESTOR_CONFIG, type IngestorConfig } from './config/env.schema.js';
import { MockModule } from './mock/mock.module.js';
import { NatsModule } from './nats/nats.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [INGESTOR_CONFIG],
      useFactory: (cfg: IngestorConfig) => ({
        pinoHttp: {
          level: cfg.LOG_LEVEL,
          base: { service: 'ingestor-mock' },
        },
      }),
    }),
    NatsModule,
    MockModule,
    AdminModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 9.2: Replace `main.ts`**

```typescript
// apps/ingestor-mock/src/main.ts
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { INGESTOR_CONFIG, type IngestorConfig } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const cfg = app.get<IngestorConfig>(INGESTOR_CONFIG);
  await app.listen(cfg.MOCK_HTTP_PORT);
}

void bootstrap();
```

- [ ] **Step 9.3: Verify typecheck and tests**

Run: `pnpm --filter @price-oracle/ingestor-mock typecheck && pnpm --filter @price-oracle/ingestor-mock test`
Expected: both PASS.

- [ ] **Step 9.4: Verify lint passes on the new app**

Run: `pnpm lint`
Expected: PASS. If `import-x/order` flags something, run `pnpm lint:fix` and re-stage.

- [ ] **Step 9.5: Commit**

```bash
git add apps/ingestor-mock/src/main.ts apps/ingestor-mock/src/app.module.ts
git commit -m "feat(PRO-12): wire NestJS bootstrap with pino logger"
```

---

## Task 10: Manual smoke test

This is a manual verification step against local infra. No commit unless a fix is needed.

- [ ] **Step 10.1: Boot local infra**

Run: `pnpm dev:infra`
Expected: NATS (4222) and Mongo (27017) reach a healthy state per docker compose `--wait`.

- [ ] **Step 10.2: Boot the mock**

Run (in a second terminal): `pnpm --filter @price-oracle/ingestor-mock start:dev`
Expected stdout: `nats.connected` line within a second, `lifecycle.start` line immediately after.

- [ ] **Step 10.3: Subscribe to NATS in a third terminal**

Install nats CLI if absent (`brew install nats-io/nats-tools/nats`), then:

Run: `nats sub 'ticks.>'`
Expected: ticks for both `ticks.btc.mock` and `ticks.eth.mock` arrive at ~250 ms cadence, each with a header `x-correlation-id`.

- [ ] **Step 10.4: Exercise admin endpoints**

```bash
# Disconnect ETH only
curl -X POST http://localhost:7401/admin/eth/disconnect
# Expected: {"asset":"eth","mode":"disconnected","since":<ts>}
# Observed on NATS sub: only ticks.btc.mock continues, ticks.eth.mock stops.

# Status
curl http://localhost:7401/admin/status
# Expected: states array with eth=disconnected, btc=healthy.

# Stale BTC — value should freeze
curl -X POST http://localhost:7401/admin/btc/stale
# NATS sub: ticks.btc.mock keeps coming but price field stays constant.

# Malformed BTC — replace stale (mutually exclusive)
curl -X POST http://localhost:7401/admin/btc/malformed
# NATS sub: ticks.btc.mock payloads now contain price: null.

# Reset everything
curl -X POST http://localhost:7401/admin/reset-all
# Expected: both back to healthy; ticks resume normally for both assets.

# Idempotency probe
curl -X POST http://localhost:7401/admin/btc/disconnect
sleep 1
curl -X POST http://localhost:7401/admin/btc/disconnect
# Compare `since` in both responses — must be identical.

# Invalid asset
curl -X POST http://localhost:7401/admin/sol/disconnect -i
# Expected: 400 Bad Request with {error:"invalid_asset", ...}.
```

- [ ] **Step 10.5: Tear down**

Run: `pnpm dev:infra:reset` and stop the mock with Ctrl-C.

If any step fails, file a fix as a new task before opening the PR.

---

## Task 11: Open PR

- [ ] **Step 11.1: Push the branch**

Run: `git push -u origin feat/PRO-12-mock-ingestor`

- [ ] **Step 11.2: Open PR**

```bash
gh pr create --title "feat(PRO-12): mock ingestor with per-asset chaos admin API" --body "$(cat <<'EOF'
## Summary
- Adds `apps/ingestor-mock`, a thin NestJS service that publishes synthetic BTC and ETH ticks on `ticks.<asset>.mock` at a configurable cadence (default 250 ms).
- Exposes idempotent admin endpoints for per-asset chaos: `disconnect`, `stale`, `malformed`, `reset`, plus a global `reset-all` and a `status` snapshot.
- Wire-level semantics are observably distinct per mode so each downstream failure path in the aggregator (staleness FSM, anomaly detector, Zod boundary) has a canonical trigger.

## Test plan
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm lint`
- [ ] Manual smoke per the plan §Task 10 (NATS subscription + curl admin endpoints, verify per-asset isolation, idempotency, 400 on bad asset)

Jira: [PRO-12](https://wagner-dev.atlassian.net/browse/PRO-12)
Spec: `docs/superpowers/specs/2026-05-21-pro-12-mock-ingestor-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 11.3: Verify CI green and request review**

Watch the PR checks; if CI is red, fix and push to the same branch.

---

## Acceptance Criteria coverage

| AC (from PRO-12)                                      | Task / Step                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| First valid tick within 100 ms of startup             | Task 7 step 7.1 `should publish a tick for both assets within 100 ms of module init` + Task 7.3 `onModuleInit` emits immediately. |
| `disconnect` stops publish for that asset only        | Task 7 step 7.1 `should skip publish for the disconnected asset only`.                                                            |
| `stale` freezes value at last published price         | Task 8 step 8.1 `should snapshot last published price when setting stale`; Task 7 `should publish frozen price for stale asset`.  |
| `malformed` publishes payload that fails consumer Zod | Task 7 `should publish null-price payload via publishRaw for malformed asset` (asserts `TickSchema.safeParse` fails).             |
| Chaos on one asset does not affect the other          | Task 4 `should isolate state mutations across assets` + Task 7 disconnect-isolation test.                                         |
| Global `reset-all` restores both                      | Task 4 `should restore both assets to healthy on resetAll` + Task 8 `should restore both assets on POST /admin/reset-all`.        |
| Standard status codes, returns current state          | Task 8 all controller tests assert response body; Task 8 pipe test asserts 400.                                                   |
| Idempotency                                           | Task 4 + Task 8 `should be idempotent: repeated disconnect returns original since`.                                               |
| Correlation ID per tick                               | Task 7 `should attach a correlation-id header to every publish`.                                                                  |
