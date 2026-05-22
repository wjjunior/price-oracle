import type { AssetId } from '@price-oracle/contracts/primitives';

export const RESET_ALL_KEY = 'all:reset';

export function chaosActionKey(asset: AssetId, scenario: string): string {
  return `${asset}:${scenario}`;
}
