import type { SourceState } from '@price-oracle/contracts/events';
import type { AssetId, Millis } from '@price-oracle/contracts/primitives';
import type { JSX } from 'react';

import { SourceRow, useSourcesByAsset } from '@/entities/source';
import { Card } from '@/shared/ui/card';

const ASSETS: readonly AssetId[] = ['btc', 'eth'];

function AssetGroup({ asset, now }: { readonly asset: AssetId; readonly now: Millis }): JSX.Element {
  const sources = useSourcesByAsset(asset);
  const rows = Object.values(sources).filter((s): s is SourceState => s !== undefined);
  return (
    <Card data-slot="source-group" data-asset={asset} className="gap-2 p-4">
      <span className="text-xs font-medium uppercase text-muted-foreground">{asset}</span>
      {rows.length === 0 ? (
        <span className="text-sm text-muted-foreground">No sources reporting</span>
      ) : (
        rows.map((source) => <SourceRow key={source.source} state={source} now={now} />)
      )}
    </Card>
  );
}

export function SourceHealth({ now }: { readonly now: Millis }): JSX.Element {
  return (
    <section data-slot="source-health" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {ASSETS.map((asset) => (
        <AssetGroup key={asset} asset={asset} now={now} />
      ))}
    </section>
  );
}
