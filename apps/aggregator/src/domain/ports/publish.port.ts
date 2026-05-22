import type { AggregatePrice } from '../types.js';
import type { CorrelationId } from '@price-oracle/contracts/primitives';


export interface PublishPort {
  publishAggregate(aggregate: AggregatePrice, correlationId: CorrelationId): Promise<void>;
}

export const PUBLISH_PORT = Symbol.for('@price-oracle/aggregator/publish-port');
