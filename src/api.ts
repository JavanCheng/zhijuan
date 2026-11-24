export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Body = Record<string, unknown> | FormData | undefined;

export async function api<T>(path: string, init: { method?: string; body?: Body } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  const res = await fetch(path, {
    method: init.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
    credentials: 'same-origin',
  });

  if (!res.ok) {
    let message = `请求失败（${res.status}）`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      if (data?.error && data.error !== 'Unauthorized') message = data.error;
      else if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const post = <T>(path: string, body?: Record<string, unknown>) => api<T>(path, { method: 'POST', body });
export const put = <T>(path: string, body?: Record<string, unknown>) => api<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body?: Record<string, unknown>) => api<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });
