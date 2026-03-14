const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

/* ── SWR-style cache ─────────────────────────────────────── */

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const STALE_MS = 30_000; // 30s — return cached but revalidate

/** Clear all cached data (e.g. on logout). */
export function clearCache() {
  cache.clear();
  inflight.clear();
}

/** Prefetch a GET endpoint into cache (fire-and-forget). */
export function prefetch(path: string) {
  if (typeof window === "undefined") return;
  const token = getToken();
  if (!token) return;
  // Only prefetch if not already cached or in-flight
  const entry = cache.get(path);
  if (entry && Date.now() - entry.timestamp < STALE_MS) return;
  if (inflight.has(path)) return;
  // Fire-and-forget
  api(path).catch(() => {});
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const method = (options.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const cacheKey = path;

  // For GET requests: return cached data if fresh
  if (isGet) {
    const entry = cache.get(cacheKey);
    if (entry && Date.now() - entry.timestamp < STALE_MS) {
      // Still fresh — return instantly, no network call
      return entry.data as T;
    }

    // Stale or missing — deduplicate in-flight requests
    const existing = inflight.get(cacheKey);
    if (existing) return existing as Promise<T>;
  }

  const request = (async () => {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.detail || res.statusText);
    }

    if (res.status === 204) return undefined as T;
    const data = await res.json();

    // Cache GET responses
    if (isGet) {
      cache.set(cacheKey, { data, timestamp: Date.now() });
    } else {
      // Mutating request — invalidate related caches
      invalidateRelated(path);
    }

    return data as T;
  })();

  if (isGet) {
    inflight.set(cacheKey, request);
    request.finally(() => inflight.delete(cacheKey));
  }

  // For stale GET: return stale data immediately, revalidate in background
  if (isGet) {
    const staleEntry = cache.get(cacheKey);
    if (staleEntry) {
      // Fire revalidation in background, return stale data now
      request.catch(() => {}); // swallow bg errors
      return staleEntry.data as T;
    }
  }

  return request;
}

/** Invalidate cache entries related to a mutation path. */
function invalidateRelated(mutationPath: string) {
  // e.g. DELETE /api/candidates/123 → invalidate /api/candidates*
  const base = mutationPath.split("/").slice(0, 4).join("/");
  for (const key of cache.keys()) {
    if (key.startsWith(base)) {
      cache.delete(key);
    }
  }
  // Also invalidate analytics (affected by most mutations)
  for (const key of cache.keys()) {
    if (key.includes("/analytics")) {
      cache.delete(key);
    }
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || res.statusText);
  }

  // Invalidate related caches after upload
  invalidateRelated(path);

  return res.json();
}
