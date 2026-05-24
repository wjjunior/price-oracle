/**
 * @file Public entry point for the NATS sub-path of
 * `@price-oracle/ingestor-transport`.
 *
 * Consumers import from the specific subpath, not the package root:
 *
 *   import { NatsService } from '@price-oracle/ingestor-transport/nats';
 *   import { nextDelayMs } from '@price-oracle/ingestor-transport/backoff';
 *
 * That two-subpath layout is configured in `package.json` under
 * `exports`. CLAUDE.md asks for the same discipline on `@price-oracle/
 * contracts` ("import from the most specific path; no barrel re-export
 * at the package root") and the rationale is identical: subpath imports
 * keep tree-shaking honest and make it obvious to readers which
 * concern a consumer depends on (transport vs. backoff).
 *
 * The file intentionally re-exports only what callers need:
 *
 *  - `NatsService`            — the runtime class consumers instantiate
 *                               and feed to NestJS providers.
 *  - `NatsTransportOptions`   — the constructor-argument type (exported
 *                               as `type` so it stays erased at
 *                               runtime; the options object itself is
 *                               built by each ingestor's `NatsModule`).
 *
 * Nothing else from `nats.service.ts` is part of the public surface;
 * internal helpers like `redactUrl` stay file-local.
 */
export { NatsService } from './nats.service.js';
export type { NatsTransportOptions } from './options.js';
