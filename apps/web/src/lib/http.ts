// Thin HTTP client for cloud-api. Vidyalaya is online-only: every read and
// write goes straight to the REST API over plain fetch() (see
// docs/production-readiness.md for the CORS_ALLOWED_ORIGINS allowlist that
// gates which browser origins -- including each school's subdomain -- may
// call the API).

const DEFAULT_BASE_URL = "http://localhost:3001";

function baseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? DEFAULT_BASE_URL;
}

// Derives the school's subdomain from the current browser hostname, e.g.
// "greenwood" from "greenwood.vidyalaya.in" -- sent at login so the backend
// can resolve the exact tenant instead of scanning every tenant by email
// alone (see AuthService.login). One frontend build serves every school;
// only this per-request value differs by host. Returns undefined for
// localhost, a bare IP, a two-label host (e.g. the apex "vidyalaya.in"
// itself, which has no subdomain to extract), or a known non-tenant host
// label -- a shared, not-school-specific frontend (e.g. a marketing/login
// landing page at "app.vidyalaya.in" for schools not yet on their own
// subdomain) must NOT be treated as a real tenant subdomain, or its users
// would get an unconditional "Invalid email or password" instead of the
// intended tenant-less fallback. AuthService.login falls back to its
// original tenant-less lookup whenever this is omitted.
const NON_TENANT_HOST_LABELS = new Set(["app", "www", "api", "admin"]);

export function detectSubdomain(): string | undefined {
  try {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return undefined;
    }
    const labels = hostname.split(".");
    if (labels.length < 3) return undefined;
    const candidate = labels[0].toLowerCase();
    return NON_TENANT_HOST_LABELS.has(candidate) ? undefined : candidate;
  } catch {
    return undefined;
  }
}

const ACCESS_TOKEN_KEY = "vidyalaya.access_token";
const REFRESH_TOKEN_KEY = "vidyalaya.refresh_token";

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setTokens(accessToken: string, refreshToken: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // localStorage unavailable (private mode, etc.) -- the session just
    // won't survive a reload, which is a reasonable degradation.
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Called once on app boot; invoked whenever a request can't be recovered by refreshing the access token. */
export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn;
}

// Single-flight refresh: concurrent 401s while a refresh is already in
// flight all await the same promise instead of each racing their own
// refresh call.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${baseUrl()}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { access_token: string };
        try {
          localStorage.setItem(ACCESS_TOKEN_KEY, body.access_token);
        } catch {
          // ignore
        }
        return body.access_token;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | null | undefined>): string {
  const url = new URL(path, baseUrl());
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(", ");
    if (body.message) return body.message;
  } catch {
    // response wasn't JSON -- fall through to the generic message
  }
  return `Request failed with status ${res.status}`;
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  skipAuth?: boolean;
}

async function request<T>(method: string, path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  const url = buildUrl(path, opts?.query);

  const doFetch = (token: string | null) =>
    fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res: Response;
  try {
    res = await doFetch(opts?.skipAuth ? null : getAccessToken());
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }

  if (res.status === 401 && !opts?.skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      clearTokens();
      unauthorizedHandler?.();
      throw new ApiError(401, "Your session has expired. Please log in again.");
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const http = {
  get: <T>(path: string, query?: RequestOptions["query"]) => request<T>("GET", path, undefined, { query }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body, opts),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
