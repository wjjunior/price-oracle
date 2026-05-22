import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpError, httpGet, httpPost } from './http-client.js';

afterEach(() => vi.restoreAllMocks());

describe('httpGet', () => {
  it('should GET and parse the JSON body on a 2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ value: 7 }), { status: 200 }),
    );
    const out = await httpGet('/snapshot', (v) => v as { value: number });
    expect(out).toEqual({ value: 7 });
  });

  it('should throw a typed HttpError carrying status and parsed body on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }),
    );
    const error = await httpGet('/snapshot', (v) => v).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 503, body: { error: 'unavailable' } });
  });

  it('should thread the caller AbortSignal so an abort cancels the request', async () => {
    let captured: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      captured = (init as RequestInit | undefined)?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const controller = new AbortController();
    void httpGet('/snapshot', (v) => v, { signal: controller.signal });
    controller.abort();
    expect(captured).toBeInstanceOf(AbortSignal);
    expect(captured?.aborted).toBe(true);
  });
});

describe('httpPost', () => {
  it('should POST a JSON body with a content-type header and parse the response', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const out = await httpPost('/diagnose', { asset: 'btc' }, (v) => v as { ok: boolean });
    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/diagnose'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ asset: 'btc' }),
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
  });

  it('should resolve a parsed undefined body for an empty 2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(httpPost('/admin/reset', {}, (v) => v)).resolves.toBeUndefined();
  });
});
