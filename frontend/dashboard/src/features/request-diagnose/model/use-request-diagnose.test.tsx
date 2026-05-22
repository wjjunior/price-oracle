import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRequestDiagnose } from './use-request-diagnose.js';

import type { JSX, ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const okResponse = (markdown: string): Response =>
  new Response(JSON.stringify({ asset: 'btc', markdown, latencyMs: 5, generatedAt: 1 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => vi.restoreAllMocks());

describe('useRequestDiagnose', () => {
  it('should POST to /api/diagnose with the asset in the query string', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('# Ok'));
    const { result } = renderHook(() => useRequestDiagnose(), { wrapper });
    act(() => result.current.request('btc'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/diagnose?asset=btc'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('should expose the answered markdown on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('# Diagnosis'));
    const { result } = renderHook(() => useRequestDiagnose(), { wrapper });
    act(() => result.current.request('btc'));
    await waitFor(() =>
      expect(result.current.view).toEqual({ state: 'answered', markdown: '# Diagnosis' }),
    );
  });

  it('should report loading while the request is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { result } = renderHook(() => useRequestDiagnose(), { wrapper });
    act(() => result.current.request('btc'));
    await waitFor(() => expect(result.current.view.state).toBe('loading'));
    act(() => resolveFetch(okResponse('# Ok')));
    await waitFor(() => expect(result.current.view.state).toBe('answered'));
  });

  it('should show a friendly toast and return to empty on HTTP 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"rate"}', { status: 429 }));
    const { result } = renderHook(() => useRequestDiagnose(), { wrapper });
    act(() => result.current.request('btc'));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.view.state).toBe('empty'));
  });

  it('should show an error toast with a retry action on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"x"}', { status: 500 }));
    const { result } = renderHook(() => useRequestDiagnose(), { wrapper });
    act(() => result.current.request('btc'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Diagnose request failed',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Retry' }) }),
      ),
    );
    await waitFor(() => expect(result.current.view.state).toBe('empty'));
  });

  it('should clear back to empty on reset', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('# Ok'));
    const { result } = renderHook(() => useRequestDiagnose(), { wrapper });
    act(() => result.current.request('btc'));
    await waitFor(() => expect(result.current.view.state).toBe('answered'));
    act(() => result.current.reset());
    await waitFor(() => expect(result.current.view.state).toBe('empty'));
  });
});
