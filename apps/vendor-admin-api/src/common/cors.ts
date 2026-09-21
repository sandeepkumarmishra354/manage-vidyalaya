// Duplicated from apps/cloud-api/src/common/cors.ts (small, dependency-
// free -- not worth extracting into a shared package for one copy).
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
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, patterns.some((pattern) => pattern.test(origin)));
    },
  };
}
