import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiagnosePanel } from './DiagnosePanel.js';

import type { RenderResult } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const okResponse = (markdown: string): Response =>
  new Response(JSON.stringify({ asset: 'btc', markdown, latencyMs: 5, generatedAt: 1 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function renderPanel(): RenderResult {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<DiagnosePanel />, { wrapper: Wrapper });
}

afterEach(() => vi.restoreAllMocks());

describe('DiagnosePanel', () => {
  it('should render the empty card and a BTC/ETH toggle initially', () => {
    renderPanel();
    expect(screen.getByText(/request a diagnosis/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BTC' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ETH' })).toBeInTheDocument();
  });

  it('should POST for the default btc asset when Diagnose is clicked', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('# Ok'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/diagnose?asset=btc'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('should POST asset=eth after toggling to ETH', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('# Ok'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'ETH' }));
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/diagnose?asset=eth'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('should disable the Diagnose button while loading', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Diagnose' })).toBeDisabled());
    resolveFetch(okResponse('# Ok'));
  });

  it('should render the markdown response in the card', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('## Diagnosis\n\nLooks healthy.'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }));
    expect(await screen.findByRole('heading', { name: 'Diagnosis' })).toBeInTheDocument();
    expect(screen.getByText('Looks healthy.')).toBeInTheDocument();
  });

  it('should not render raw HTML embedded in the markdown response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse('Safe text <img src=x onerror="alert(1)"> <script>alert(2)</script>'),
    );
    const { container } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }));
    await screen.findByText(/Safe text/);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});
