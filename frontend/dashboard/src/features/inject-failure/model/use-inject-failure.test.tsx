import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useInjectFailure } from './use-inject-failure.js';

import type { JSX, ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.restoreAllMocks());

describe('useInjectFailure', () => {
  it('should open a confirmation without firing the request', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useInjectFailure(), { wrapper });

    act(() => result.current.request('eth', 'stale'));

    expect(result.current.confirmTarget).toEqual({ kind: 'asset', asset: 'eth', scenario: 'stale' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should POST /admin/eth/stale on confirm and clear pending on success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const { result } = renderHook(() => useInjectFailure(), { wrapper });

    act(() => result.current.request('eth', 'stale'));
    act(() => result.current.confirm());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/admin/eth/stale'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(result.current.pending.size).toBe(0));
    expect(result.current.confirmTarget).toBeNull();
  });

  it('should mark the action pending while the request is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { result } = renderHook(() => useInjectFailure(), { wrapper });

    act(() => result.current.request('eth', 'stale'));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.pending.has('eth:stale')).toBe(true));
    act(() => resolveFetch(new Response('{}', { status: 200 })));
    await waitFor(() => expect(result.current.pending.has('eth:stale')).toBe(false));
  });

  it('should toast and clear pending on a failed request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"x"}', { status: 503 }));
    const { result } = renderHook(() => useInjectFailure(), { wrapper });

    act(() => result.current.request('btc', 'disconnect'));
    act(() => result.current.confirm());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() => expect(result.current.pending.size).toBe(0));
  });

  it('should cancel without firing the request', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useInjectFailure(), { wrapper });

    act(() => result.current.request('btc', 'malformed'));
    act(() => result.current.cancel());

    expect(result.current.confirmTarget).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
