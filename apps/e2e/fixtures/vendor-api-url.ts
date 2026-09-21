// vendor-admin-api is a deliberately separate NestJS service from
// cloud-api (different JWT secret, different port) -- see
// apps/vendor-admin-api/src/auth/jwt.strategy.ts's comment. Mirrors
// api-url.ts's "/api" global-prefix + trailing-slash reasoning exactly.
export const VENDOR_API_ORIGIN = process.env.E2E_VENDOR_API_URL ?? "http://localhost:3002";
export const VENDOR_API_BASE_URL = `${VENDOR_API_ORIGIN}/api/`;
