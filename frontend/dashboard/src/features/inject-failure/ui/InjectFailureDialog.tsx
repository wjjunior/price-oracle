import type { InjectFailureConfirm } from '../model/use-inject-failure.js';
import type { JSX } from 'react';

import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';


function describeTarget(target: InjectFailureConfirm): string {
  return target.kind === 'reset-all'
    ? 'Reset all injected chaos on the mock source.'
    : `Inject "${target.scenario}" on the mock ${target.asset.toUpperCase()} feed.`;
}

export function InjectFailureDialog({
  target,
  onConfirm,
  onCancel,
}: {
  readonly target: InjectFailureConfirm | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent data-slot="inject-failure-dialog">
        <DialogHeader>
          <DialogTitle>Confirm chaos action</DialogTitle>
          <DialogDescription>{target === null ? '' : describeTarget(target)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
