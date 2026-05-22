export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

function buildSignal(options: HttpOptions | undefined): AbortSignal {
  const signals = [AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS)];
  if (options?.signal) signals.push(options.signal);
  return AbortSignal.any(signals);
}

async function request<T>(
  path: string,
  init: RequestInit,
  parse: (value: unknown) => T,
  options: HttpOptions | undefined,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { ...init, signal: buildSignal(options) });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  if (!response.ok) throw new HttpError(response.status, parsed);
  return parse(parsed);
}

export function httpGet<T>(
  path: string,
  parse: (value: unknown) => T,
  options?: HttpOptions,
): Promise<T> {
  return request(path, { method: 'GET', headers: { accept: 'application/json' } }, parse, options);
}

export function httpPost<T>(
  path: string,
  body: unknown,
  parse: (value: unknown) => T,
  options?: HttpOptions,
): Promise<T> {
  return request(
    path,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    parse,
    options,
  );
}
