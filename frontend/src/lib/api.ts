/** Thin fetch wrapper: attaches the bearer token and unwraps API errors. */

const TOKEN_KEY = "luxenails.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * Where the API lives. Empty in dev (Vite proxies /api to :4000) and when the
 * API is same-origin. Set VITE_API_BASE_URL to the backend's URL when the
 * frontend and backend are deployed as separate origins (e.g. two Vercel
 * projects). Trailing slash is trimmed so `${API_BASE}/api/...` stays clean.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Fired on a 401 so the app can bounce the user back to the login screen. */
export const onUnauthorized = { handler: null as null | (() => void) };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();

  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}) as Record<string, unknown>);

  if (!response.ok) {
    if (response.status === 401) {
      tokenStore.clear();
      onUnauthorized.handler?.();
    }
    const message =
      typeof payload?.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, payload?.details);
  }

  return payload as T;
}

const body = (data: unknown) => JSON.stringify(data ?? {});

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: "POST", body: body(data) }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: "PATCH", body: body(data) }),
  put: <T>(path: string, data?: unknown) => request<T>(path, { method: "PUT", body: body(data) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Builds a querystring, dropping empty values so filters stay tidy. */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}
