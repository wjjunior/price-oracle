import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatTrendAxisPrice, formatTrendTime, formatTrendValue } from '../model/format-trend.js';

import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { usePriceHistory, type TrendPoint } from '@/entities/price-aggregate';
import { Card } from '@/shared/ui/card';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

const FLOOR_VISUAL_FRACTION = 0.05;

const COLOR = {
  band: 'var(--brand)',
  price: 'var(--muted-foreground)',
  floor: 'var(--degraded)',
  axis: 'var(--chart-tick)',
} as const;

function priceFloor(points: readonly TrendPoint[]): number {
  if (points.length === 0) return 0;
  const min = Math.min(...points.map((p) => p.price));
  return min * FLOOR_VISUAL_FRACTION;
}

function ChartLegend(): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 bg-muted-foreground/60" />
        Price
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1 w-3 rounded-sm bg-brand/30" />
        Confidence band
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
  const floor = priceFloor(points);

  return (
    <Card data-slot="price-trend" data-asset={asset} className="gap-4 py-4 px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.6px] text-muted-foreground">
          {asset.toUpperCase()} — Confidence &amp; Price
        </span>
        <ChartLegend />
      </div>
      <div className="h-44">
        {points.length === 0 ? (
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
                orientation="right"
                domain={[0, 'auto']}
                tickFormatter={formatTrendAxisPrice}
                tick={{ fontSize: 10, fill: COLOR.axis }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <ReferenceLine
                y={floor}
                stroke={COLOR.floor}
                strokeDasharray="4 3"
                strokeWidth={1.5}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={formatTrendValue}
                labelFormatter={formatTrendTime}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="none"
                fill={COLOR.band}
                fillOpacity={0.18}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke={COLOR.price}
                strokeOpacity={0.7}
                strokeWidth={1.5}
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
