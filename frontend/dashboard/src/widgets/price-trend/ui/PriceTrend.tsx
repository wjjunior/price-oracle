import {
  Area,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { toBandSeries } from '../model/confidence-band.js';
import { formatTrendTime, formatTrendValue } from '../model/format-trend.js';

import type { AssetId } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { usePriceHistory } from '@/entities/price-aggregate';
import { Card } from '@/shared/ui/card';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

// Mirrors the aggregator's BREAKER_CONFIDENCE_FLOOR default.
const BREAKER_FLOOR = 0.6;

const TREND_COLOR = {
  band: 'var(--brand-cyan)',
  price: 'var(--brand)',
  confidence: 'var(--healthy)',
  floor: 'var(--degraded)',
} as const;

const LEGEND_LABELS: Record<string, string> = {
  band: 'Uncertainty',
  price: 'Price',
  confidence: 'Confidence',
};

function AssetTrend({ asset }: { readonly asset: AssetId }): JSX.Element {
  const points = usePriceHistory(asset);
  const series = toBandSeries(points);

  return (
    <Card data-slot="price-trend" data-asset={asset} className="gap-1 p-4">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {asset} — confidence &amp; price
      </span>
      <div className="h-44">
        {series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Waiting for data…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: -28 }}>
              <XAxis dataKey="t" hide />
              <YAxis yAxisId="confidence" domain={[0, 1]} hide />
              <YAxis yAxisId="price" orientation="right" domain={['auto', 'auto']} hide />
              <ReferenceLine
                yAxisId="confidence"
                y={BREAKER_FLOOR}
                stroke={TREND_COLOR.floor}
                strokeDasharray="4 3"
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={formatTrendValue}
                labelFormatter={formatTrendTime}
              />
              <Legend
                iconType="plainline"
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value: string) => LEGEND_LABELS[value] ?? value}
              />
              <Area
                yAxisId="price"
                type="monotone"
                dataKey="band"
                stroke="none"
                fill={TREND_COLOR.band}
                fillOpacity={0.18}
                isAnimationActive={false}
              />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke={TREND_COLOR.price}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="confidence"
                type="monotone"
                dataKey="confidence"
                stroke={TREND_COLOR.confidence}
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
