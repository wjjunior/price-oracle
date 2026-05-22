import type { Tick } from '../types.js';
import type { CorrelationId } from '@price-oracle/contracts/primitives';


export type Unsubscribe = () => void;

export interface SourceStreamPort {
  subscribe(onTick: (tick: Tick, correlationId: CorrelationId) => void): Unsubscribe;
}

export const SOURCE_STREAM_PORT = Symbol.for('@price-oracle/aggregator/source-stream-port');
