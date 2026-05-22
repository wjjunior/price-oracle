import type { AssetId } from '@price-oracle/contracts/primitives';

export type ChaosScenario = 'disconnect' | 'stale' | 'malformed' | 'reset';

export const CHAOS_SCENARIOS: readonly ChaosScenario[] = ['disconnect', 'stale', 'malformed', 'reset'];
export const RESET_ALL_KEY = 'all:reset';

export function chaosActionKey(asset: AssetId, scenario: ChaosScenario): string {
  return `${asset}:${scenario}`;
}
