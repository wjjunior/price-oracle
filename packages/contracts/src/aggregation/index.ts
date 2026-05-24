/**
 * @file Subpath public surface for `@price-oracle/contracts/aggregation`.
 *
 * The package follows a no-barrel convention at the package root
 * (see `decisions.md` entry on contracts), but each subpath gets a
 * curated `index.ts` so consumers depend on this directory's surface
 * rather than reaching into individual files. Adding a new export
 * here is the explicit "we are committing to this name across
 * services" gesture.
 *
 * Surface today:
 *  - The four aggregation factor functions (`computeAgreement`,
 *    `computeFreshness`, `computeCoverage`, `computeConfidence`).
 *  - The shared default `BREAKER_CONFIDENCE_FLOOR_DEFAULT`.
 *  - The pure `weightedMedian` aggregator and its `WeightedSample`
 *    input type.
 */
export { computeAgreement } from './agreement.js';
export { BREAKER_CONFIDENCE_FLOOR_DEFAULT } from './breaker.js';
export { computeConfidence } from './confidence.js';
export { computeCoverage } from './coverage.js';
export { computeFreshness } from './freshness.js';
export { weightedMedian, type WeightedSample } from './weighted-median.js';
