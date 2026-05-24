/**
 * @file The gating layer for the chaos surface. This is the file that
 * makes "the mock image is safe outside dev" true.
 *
 * **The gate.** `AdminModule.register(enabled)` is a NestJS dynamic
 * module: when `enabled` is `false` (the default, since PRO-54), it
 * returns an *empty* module — no controllers, no providers, nothing
 * mounted on the HTTP surface. When `enabled` is `true`, it mounts
 * the `AdminController` (the four chaos endpoints + status +
 * reset-all) and registers the `AssetParamPipe`.
 *
 * The flag flows in from `IngestorConfig.adminEnabled`, which the
 * `MOCK_ADMIN_ENABLED` env var feeds (see `config/env.schema.ts`).
 * Composition site is `app.module.ts`:
 *
 *   AdminModule.register(config.adminEnabled)
 *
 * — a single line, evaluated once at boot. There is no runtime
 * "is admin enabled?" check inside the controller because if the
 * controller is mounted, admin is enabled by definition. CLAUDE.md
 * operational quirks: "Mock ingestor admin API is dev-only. Disable
 * the admin API via env flag in production."
 *
 * **Why a dynamic module instead of a runtime guard.** The alternative
 * — mount the controller always, then check the flag in a Nest guard
 * — would still expose the routes (they would just return 403). That
 * is a worse security posture: any future bug that bypasses the guard
 * exposes the chaos surface. The dynamic-module approach makes "the
 * routes do not exist" the property we enforce, not "the routes
 * exist but are denied" — fewer ways for a regression to slip
 * through.
 *
 * **PRO history.** PRO-44 introduced the flag and the dynamic module;
 * PRO-54 flipped the default to `false` so that a deployed mock
 * image without the env var set is safe by default.
 *
 * Cross-refs:
 *  - `admin.controller.ts` for the actual endpoints.
 *  - `asset-param.pipe.ts` for the `:asset` validation pipe.
 *  - `../mock/mock.module.ts` — imported here so the controller can
 *    inject the singleton chaos services without us re-declaring them
 *    (re-declaration would give us two instances of `ChaosStateService`
 *    and silently break the "single source of truth" invariant).
 *  - `../config/env.schema.ts` for `MOCK_ADMIN_ENABLED` and the
 *    default-false behavior.
 */
import { Module, type DynamicModule } from '@nestjs/common';

import { MockModule } from '../mock/mock.module.js';

import { AdminController } from './admin.controller.js';
import { AssetParamPipe } from './asset-param.pipe.js';

@Module({})
export class AdminModule {
  /**
   * Build the admin module conditionally.
   *
   * @param enabled `true` to mount the chaos endpoints; `false` to
   *                return an empty module that does nothing. Fed from
   *                `IngestorConfig.adminEnabled` at composition time
   *                in `app.module.ts`.
   * @returns A `DynamicModule`. When disabled, only the `module`
   *          identity is returned (Nest will still process it, but
   *          nothing is wired). When enabled, `MockModule` is imported
   *          so the controller can inject `ChaosStateService` and
   *          `TickGeneratorService` as singletons.
   */
  static register(enabled: boolean): DynamicModule {
    if (!enabled) return { module: AdminModule };
    return {
      module: AdminModule,
      imports: [MockModule],
      controllers: [AdminController],
      providers: [AssetParamPipe],
    };
  }
}
