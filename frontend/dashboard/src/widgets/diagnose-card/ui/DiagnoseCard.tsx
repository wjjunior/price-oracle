import Markdown from 'react-markdown';

import type { JSX } from 'react';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

export type DiagnoseState = 'empty' | 'loading' | 'answered';

export function DiagnoseCard({
  state,
  markdown,
  onRequest,
}: {
  readonly state: DiagnoseState;
  readonly markdown?: string;
  readonly onRequest?: () => void;
}): JSX.Element {
  return (
    <Card data-slot="diagnose-card" className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Diagnose</span>
        <Button size="sm" onClick={onRequest} disabled={state === 'loading'}>
          Diagnose
        </Button>
      </div>
      {state === 'empty' ? (
        <p className="text-sm text-muted-foreground">
          Request a diagnosis to explain the current feed state.
        </p>
      ) : null}
      {state === 'loading' ? (
        <div data-slot="diagnose-loading" className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : null}
      {state === 'answered' && markdown !== undefined ? (
        <div data-slot="diagnose-markdown" className="text-sm [&_h2]:mb-1 [&_h2]:font-semibold">
          <Markdown>{markdown}</Markdown>
        </div>
      ) : null}
    </Card>
  );
}
