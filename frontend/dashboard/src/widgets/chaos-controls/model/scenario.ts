export type ChaosScenario = 'disconnect' | 'stale' | 'malformed' | 'reset';

export const CHAOS_SCENARIOS: readonly ChaosScenario[] = ['disconnect', 'stale', 'malformed', 'reset'];
