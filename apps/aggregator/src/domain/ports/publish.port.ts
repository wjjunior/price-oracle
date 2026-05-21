import type { AggregatePrice } from '../types.js';

export interface PublishPort {
  publishAggregate(aggregate: AggregatePrice): Promise<void>;
}

export const PUBLISH_PORT = Symbol.for('@price-oracle/aggregator/publish-port');
