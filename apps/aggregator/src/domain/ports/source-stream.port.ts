import type { Tick } from '../types.js';

export type Unsubscribe = () => void;

export interface SourceStreamPort {
  subscribe(onTick: (tick: Tick) => void): Unsubscribe;
}

export const SOURCE_STREAM_PORT = Symbol.for('@price-oracle/aggregator/source-stream-port');
