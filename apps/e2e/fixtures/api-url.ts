// cloud-api serves every route under a global "/api" prefix (see
// apps/cloud-api/src/main.ts's app.setGlobalPrefix("api")) so a reverse
// proxy in front of a production deployment can route "/api/*" to the
// backend and everything else to the static SPA build. Every place that
// talks to cloud-api directly -- the Playwright webServer health check,
// global-setup.ts's login-and-seed-storageState pass, and api-client.ts's
// request contexts -- needs the same prefix, so it's centralized here
// once rather than risking one call site getting updated and another
// missed (exactly what happened with the sandbox Chromium path).
export const API_ORIGIN = process.env.E2E_API_URL ?? "http://localhost:3001";
// Trailing slash is required, not cosmetic: Playwright's APIRequestContext
// resolves a relative request path against baseURL using WHATWG URL
// semantics, which drop a base's last path segment entirely unless it ends
// in "/" -- without it, every request here would silently lose "/api" and
// hit the un-prefixed route instead (every call site below is written
// relative, with no leading slash, to pair with this).
export const API_BASE_URL = `${API_ORIGIN}/api/`;
