export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

let baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
let token: string | null = null;
let unauthorized: (() => void) | null = null;

export const getBaseUrl = () => baseUrl;
export const setBaseUrl = (u: string) => { baseUrl = u.trim().replace(/\/+$/, ''); };
export const setToken = (t: string | null) => { token = t; };
export const onUnauthorized = (fn: (() => void) | null) => { unauthorized = fn; };
/** Photos are stored as /uploads/x.jpg on the server; photos from other sites are already full addresses. */
export const assetUrl = (u?: string | null) => (!u ? undefined : /^https?:/i.test(u) ? u : `${baseUrl}${u}`);

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? (opts.body ? 'POST' : 'GET');
  const headers: Record<string, string> = { 'X-Requested-With': 'ammas', 'X-Client': 'app' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1${path}`, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError(0, 'No connection to the server. Nothing was saved.', 'OFFLINE');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && path !== '/auth/login') unauthorized?.();
    throw new ApiError(res.status, data?.error ?? 'Something went wrong.', data?.code);
  }
  return data as T;
}

export const uid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });

/** ?a=1&b=2 without relying on URLSearchParams (partly implemented on some React Native versions). */
export const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
