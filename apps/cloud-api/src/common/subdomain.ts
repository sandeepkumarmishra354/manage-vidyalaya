// Derives a school's subdomain from the request itself -- the Origin header
// (falling back to Referer), rather than trusting a client-supplied field.
// A browser sets Origin from the page's actual URL and page JavaScript
// cannot override it (it's a forbidden header name for fetch/XHR), so this
// can't be swapped out by anything running on the page the way a request
// body field could be. AuthService.login uses this to resolve the exact
// tenant a login came from instead of scanning every tenant by email alone.
const NON_TENANT_HOST_LABELS = new Set(["app", "www", "api", "admin"]);

function extractSubdomain(hostname: string): string | undefined {
  const bare = hostname.toLowerCase();
  if (bare === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) {
    return undefined;
  }
  const labels = bare.split(".");
  // Fewer than 3 labels means there's no subdomain to extract (e.g. the
  // bare apex "vidyalaya.in" itself).
  if (labels.length < 3) return undefined;
  const candidate = labels[0];
  // A shared, not-school-specific frontend (e.g. a marketing/login landing
  // page at "app.vidyalaya.in" for schools not yet on their own subdomain)
  // must NOT be treated as a real tenant subdomain, or its users would get
  // an unconditional "Invalid email or password" instead of the intended
  // tenant-less fallback.
  return NON_TENANT_HOST_LABELS.has(candidate) ? undefined : candidate;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function deriveSubdomainFromRequest(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const originOrReferer = firstHeaderValue(req.headers.origin) ?? firstHeaderValue(req.headers.referer);
  if (!originOrReferer) return undefined;

  try {
    return extractSubdomain(new URL(originOrReferer).hostname);
  } catch {
    return undefined;
  }
}
