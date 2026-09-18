// Builds a request's allowed-origin decision from CORS_ALLOWED_ORIGINS, a
// comma-separated list of exact origins or single-level subdomain wildcards
// (e.g. "https://app.vidyalaya.in,https://*.vidyalaya.in" -- the wildcard
// matches "https://greenwood.vidyalaya.in" but not
// "https://foo.bar.vidyalaya.in"). Unset falls back to allowing every
// origin, matching this codebase's existing dev-friendly-default convention
// (JWT_SECRET, etc.) -- production must set this once real school
// subdomains exist as distinct browser origins hitting the API.
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^.]+");
  return new RegExp(`^${escaped}$`);
}

type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

export interface CorsOptions {
  origin?: (origin: string | undefined, callback: CorsOriginCallback) => void;
}

export function buildCorsOptions(allowedOrigins: string | undefined): CorsOptions {
  if (!allowedOrigins) {
    return {};
  }

  const patterns = allowedOrigins
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(patternToRegExp);

  return {
    origin: (origin, callback) => {
      // No Origin header at all (server-to-server, curl, same-origin) --
      // nothing for a CORS policy to restrict.
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, patterns.some((pattern) => pattern.test(origin)));
    },
  };
}
