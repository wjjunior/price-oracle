import { PostDiagnoseResponseSchema, type PostDiagnoseRequest } from '@price-oracle/contracts/rest';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';


import type { AssetId } from '@price-oracle/contracts/primitives';

import { HttpError, httpPost } from '@/shared/api/http-client';

const RATE_LIMIT_STATUS = 429;

export type DiagnoseView =
  | { state: 'empty' }
  | { state: 'loading' }
  | { state: 'answered'; markdown: string };

export type UseRequestDiagnose = {
  view: DiagnoseView;
  request: (asset: AssetId) => void;
  reset: () => void;
};

function diagnose(asset: AssetId): Promise<string> {
  const body: PostDiagnoseRequest = { trigger: 'operator' };
  return httpPost(
    `/api/diagnose?asset=${encodeURIComponent(asset)}`,
    body,
    (value) => PostDiagnoseResponseSchema.parse(value).markdown,
  );
}

export function useRequestDiagnose(): UseRequestDiagnose {
  const mutation = useMutation({ mutationFn: diagnose });

  const request = (asset: AssetId): void => {
    mutation.mutate(asset, {
      onError: (error: unknown) => {
        if (error instanceof HttpError && error.status === RATE_LIMIT_STATUS) {
          toast('Diagnose is rate-limited — try again in a moment');
          return;
        }
        toast.error('Diagnose request failed', {
          action: { label: 'Retry', onClick: () => request(asset) },
        });
      },
    });
  };

  let view: DiagnoseView;
  if (mutation.isPending) {
    view = { state: 'loading' };
  } else if (mutation.isSuccess) {
    view = { state: 'answered', markdown: mutation.data };
  } else {
    view = { state: 'empty' };
  }

  return { view, request, reset: () => mutation.reset() };
}
