import { CircleCheckIcon, SparklesIcon } from 'lucide-react';
import { lazy, Suspense, type JSX } from 'react';

import type { AssetId, Confidence } from '@price-oracle/contracts/primitives';

import { confidenceLevel } from '@/entities/price-aggregate';
import { ConfidenceLevel } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';

const Markdown = lazy(() => import('react-markdown'));

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

type CommonProps = {
  readonly asset: AssetId;
  readonly confidence: Confidence | null;
  readonly onAssetChange: (asset: AssetId) => void;
  readonly onRequest: () => void;
};

type DiagnoseCardProps = CommonProps &
  (
    | { readonly state: 'empty' }
    | { readonly state: 'loading' }
    | { readonly state: 'answered'; readonly markdown: string }
  );

const STATUS_LABEL: Record<ConfidenceLevel, string> = {
  [ConfidenceLevel.HIGH]: 'HEALTHY',
  [ConfidenceLevel.DEGRADED]: 'DEGRADED',
  [ConfidenceLevel.UNAVAILABLE]: 'STALE',
};

const STATUS_CLASS: Record<ConfidenceLevel, string> = {
  [ConfidenceLevel.HIGH]: 'border-brand/50 bg-brand-badge-bg text-brand',
  [ConfidenceLevel.DEGRADED]: 'border-degraded/50 bg-degraded/10 text-degraded',
  [ConfidenceLevel.UNAVAILABLE]: 'border-stale/50 bg-stale/10 text-stale',
};

function AssetTabs({
  asset,
  loading,
  onChange,
}: {
  readonly asset: AssetId;
  readonly loading: boolean;
  readonly onChange: (asset: AssetId) => void;
}): JSX.Element {
  const handleValueChange = (value: string): void => {
    const next = ASSETS.find((option) => option === value);
    if (next) onChange(next);
  };
  return (
    <Tabs value={asset} onValueChange={handleValueChange}>
      <TabsList data-slot="diagnose-asset" className="h-7 rounded-full bg-muted p-0.5">
        {ASSETS.map((option) => (
          <TabsTrigger
            key={option}
            value={option}
            disabled={loading}
            className="h-6 rounded-full px-3 text-[10px]"
          >
            {option.toUpperCase()}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function StatusBadge({ confidence }: { readonly confidence: Confidence | null }): JSX.Element {
  const level = confidence === null ? ConfidenceLevel.UNAVAILABLE : confidenceLevel(confidence);
  return (
    <span
      data-slot="diagnose-status"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider',
        STATUS_CLASS[level],
      )}
    >
      <CircleCheckIcon className="size-3" aria-hidden />
      {STATUS_LABEL[level]}
    </span>
  );
}

export function DiagnoseCard(props: DiagnoseCardProps): JSX.Element {
  const loading = props.state === 'loading';

  return (
    <Card data-slot="diagnose-panel" className="min-h-[400px] gap-0 overflow-hidden py-0">
      <div className="flex flex-col gap-2 border-b border-border px-3 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.6px] text-muted-foreground">
            Diagnose
          </span>
          <AssetTabs asset={props.asset} loading={loading} onChange={props.onAssetChange} />
        </div>
        <Button
          className="h-9 w-full gap-1.5 bg-brand text-primary-foreground hover:bg-brand/90"
          onClick={props.onRequest}
          disabled={loading}
        >
          <SparklesIcon className="size-3.5" aria-hidden />
          Diagnose
        </Button>
      </div>
      {props.state === 'empty' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <SparklesIcon className="size-8 text-muted-foreground/60" aria-hidden />
          <p className="text-xs text-muted-foreground">
            Click Diagnose to generate an AI health report
          </p>
        </div>
      ) : null}
      {props.state === 'loading' ? (
        <div data-slot="diagnose-loading" className="flex flex-col gap-2 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : null}
      {props.state === 'answered' ? (
        <>
          <ScrollArea
            data-slot="diagnose-markdown"
            className="h-64 px-3 py-3"
          >
            <div className="rounded-md bg-muted/60 p-3 font-mono text-[12px] leading-5 text-foreground whitespace-pre-wrap">
              <Suspense fallback={<Skeleton className="h-4 w-full" />}>
                <Markdown>{props.markdown}</Markdown>
              </Suspense>
            </div>
          </ScrollArea>
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="truncate text-[10px] text-muted-foreground">
              {props.asset.toUpperCase()} Price Feed Health Report
            </span>
            <StatusBadge confidence={props.confidence} />
          </div>
        </>
      ) : null}
    </Card>
  );
}
