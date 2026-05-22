import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';


import { RESET_ALL_KEY, chaosActionKey } from './action-key.js';

import type { AssetId } from '@price-oracle/contracts/primitives';

import { httpPost } from '@/shared/api/http-client';

export type InjectFailureConfirm =
  | { kind: 'asset'; asset: AssetId; scenario: string }
  | { kind: 'reset-all' };

type InjectFailure = {
  request: (asset: AssetId, scenario: string) => void;
  requestResetAll: () => void;
  confirm: () => void;
  cancel: () => void;
  confirmTarget: InjectFailureConfirm | null;
  pending: ReadonlySet<string>;
};

function endpoint(target: InjectFailureConfirm): string {
  return target.kind === 'reset-all'
    ? '/admin/reset-all'
    : `/admin/${encodeURIComponent(target.asset)}/${encodeURIComponent(target.scenario)}`;
}

function pendingKey(target: InjectFailureConfirm): string {
  return target.kind === 'reset-all' ? RESET_ALL_KEY : chaosActionKey(target.asset, target.scenario);
}

export function useInjectFailure(): InjectFailure {
  const [confirmTarget, setConfirmTarget] = useState<InjectFailureConfirm | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const mutation = useMutation({
    mutationFn: (target: InjectFailureConfirm) => httpPost(endpoint(target), {}, () => undefined),
  });

  const confirm = (): void => {
    if (confirmTarget === null) return;
    const target = confirmTarget;
    const key = pendingKey(target);
    setConfirmTarget(null);
    setPending((prev) => new Set(prev).add(key));
    mutation.mutate(target, {
      onError: () => toast.error('Chaos action failed — the mock did not apply it'),
      onSettled: () =>
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        }),
    });
  };

  return {
    request: (asset, scenario): void => setConfirmTarget({ kind: 'asset', asset, scenario }),
    requestResetAll: (): void => setConfirmTarget({ kind: 'reset-all' }),
    confirm,
    cancel: (): void => setConfirmTarget(null),
    confirmTarget,
    pending,
  };
}
