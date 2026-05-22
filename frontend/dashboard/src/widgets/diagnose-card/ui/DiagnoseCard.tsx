import { SparklesIcon } from 'lucide-react';
import { lazy, Suspense, type JSX } from 'react';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Skeleton } from '@/shared/ui/skeleton';

const Markdown = lazy(() => import('react-markdown'));

export type DiagnoseState = 'empty' | 'loading' | 'answered';

export type DiagnoseCardProps = { readonly onRequest?: () => void } & (
  | { readonly state: 'empty' }
  | { readonly state: 'loading' }
  | { readonly state: 'answered'; readonly markdown: string }
);

export function DiagnoseCard(props: DiagnoseCardProps): JSX.Element {
  return (
    <Card data-slot="diagnose-card" className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <SparklesIcon className="size-4 text-brand-cyan" aria-hidden />
          Diagnose
        </span>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={props.onRequest}
          disabled={props.state === 'loading'}
        >
          <SparklesIcon className="size-3.5" aria-hidden />
          Diagnose
        </Button>
      </div>
      {props.state === 'empty' ? (
        <p className="text-sm text-muted-foreground">
          Request a diagnosis to explain the current feed state.
        </p>
      ) : null}
      {props.state === 'loading' ? (
        <div data-slot="diagnose-loading" className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : null}
      {props.state === 'answered' ? (
        <ScrollArea
          data-slot="diagnose-markdown"
          className="h-64 pr-3 text-sm [&_h2]:mb-1 [&_h2]:font-semibold"
        >
          <Suspense fallback={<Skeleton className="h-4 w-full" />}>
            <Markdown>{props.markdown}</Markdown>
          </Suspense>
        </ScrollArea>
      ) : null}
    </Card>
  );
}
