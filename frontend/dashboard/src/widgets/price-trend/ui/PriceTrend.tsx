import { BREAKER_CONFIDENCE_FLOOR_DEFAULT } from '@price-oracle/contracts/aggregation';
import {
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { priceDomain } from '../model/chart-domain.js';
import { formatTrendAxisPrice, formatTrendTime } from '../model/format-trend.js';

import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { usePriceHistory } from '@/entities/price-aggregate';
import { formatCurrency } from '@/shared/lib/format';
import { Card } from '@/shared/ui/card';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

const COLOR = {
  price: 'var(--foreground)',
  confidence: 'var(--brand)',
  floor: 'var(--degraded)',
  axis: 'var(--chart-tick)',
} as const;

type ChartTooltipProps = {
  readonly active?: boolean;
  readonly label?: number | string;
  readonly payload?: ReadonlyArray<{ readonly value?: number; readonly dataKey?: string }>;
};

function ChartTooltip({ active, payload, label }: ChartTooltipProps): JSX.Element | null {
  if (!active || !payload?.length) return null;
  const priceEntry = payload.find((entry) => entry.dataKey === 'price');
  const confidenceEntry = payload.find((entry) => entry.dataKey === 'confidence');
  const price = typeof priceEntry?.value === 'number' ? priceEntry.value : null;
  const confidence = typeof confidenceEntry?.value === 'number' ? confidenceEntry.value : null;
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm">
      <div className="text-muted-foreground">{formatTrendTime(label)}</div>
      {price !== null ? (
        <div className="font-mono tabular-nums text-card-foreground">{formatCurrency(price)}</div>
      ) : null}
      {confidence !== null ? (
        <div className="font-mono tabular-nums text-card-foreground">
          {(confidence * 100).toFixed(2)}% confidence
        </div>
      ) : null}
    </div>
  );
}

function ChartLegend(): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 bg-foreground/70" />
        Price
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-0 w-3 border-t-2 border-dashed"
          style={{ borderColor: COLOR.confidence }}
        />
        Confidence
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-0 w-3 border-t-2 border-dashed"
          style={{ borderColor: COLOR.floor }}
        />
        Breaker floor
      </span>
    </div>
  );
}

function AssetTrend({ asset }: { readonly asset: AssetId }): JSX.Element {
  const points = usePriceHistory(asset);
  const domain = priceDomain(points);

  return (
    <Card data-slot="price-trend" data-asset={asset} className="gap-4 py-4 px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.6px] text-muted-foreground">
          {asset.toUpperCase()} — Confidence &amp; Price
        </span>
        <ChartLegend />
      </div>
      <div className="h-44">
        {points.length === 0 || domain === undefined ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Waiting for data…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="t"
                tickFormatter={formatTrendTime}
                tick={{ fontSize: 10, fill: COLOR.axis }}
                axisLine={false}
                tickLine={false}
                minTickGap={64}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                domain={domain}
                tickFormatter={formatTrendAxisPrice}
                tick={{ fontSize: 10, fill: COLOR.axis }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <YAxis
                yAxisId="confidence"
                orientation="left"
                domain={[0, 1]}
                ticks={[0, BREAKER_CONFIDENCE_FLOOR_DEFAULT, 1]}
                tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
                tick={{ fontSize: 10, fill: COLOR.axis }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <ReferenceLine
                yAxisId="confidence"
                y={BREAKER_CONFIDENCE_FLOOR_DEFAULT}
                stroke={COLOR.floor}
                strokeDasharray="4 3"
                strokeWidth={1.5}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--muted-foreground)' }} />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke={COLOR.price}
                strokeOpacity={0.85}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="confidence"
                type="monotone"
                dataKey="confidence"
                stroke={COLOR.confidence}
                strokeOpacity={0.8}
                strokeWidth={1.5}
                strokeDasharray="3 2"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export function PriceTrend(): JSX.Element {
  return (
    <section data-slot="price-trends" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {ASSETS.map((asset) => (
        <AssetTrend key={asset} asset={asset} />
      ))}
    </section>
  );
}
