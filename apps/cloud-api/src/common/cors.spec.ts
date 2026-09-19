import { buildCorsOptions } from "./cors.js";

function isAllowed(origin: string | undefined, allowedOrigins: string | undefined): boolean {
  const options = buildCorsOptions(allowedOrigins);
  let result: boolean | undefined;
  options.origin?.(origin, (_err, allow) => {
    result = allow;
  });
  return result ?? false;
}

describe("buildCorsOptions", () => {
  it("allows every origin when CORS_ALLOWED_ORIGINS is unset", () => {
    const options = buildCorsOptions(undefined);
    expect(options.origin).toBeUndefined();
  });

  it("allows a request with no Origin header regardless of the allowlist", () => {
    expect(isAllowed(undefined, "https://app.vidyalaya.in")).toBe(true);
  });

  it("allows an exact origin match", () => {
    expect(isAllowed("https://app.vidyalaya.in", "https://app.vidyalaya.in")).toBe(true);
  });

  it("rejects an origin not in the allowlist", () => {
    expect(isAllowed("https://evil.example.com", "https://app.vidyalaya.in")).toBe(false);
  });

  it("allows a single-level subdomain wildcard match", () => {
    expect(isAllowed("https://greenwood.vidyalaya.in", "https://*.vidyalaya.in")).toBe(true);
  });

  it("does not let a wildcard match more than one subdomain level", () => {
    expect(isAllowed("https://foo.bar.vidyalaya.in", "https://*.vidyalaya.in")).toBe(false);
  });

  it("rejects the bare apex domain against a subdomain-only wildcard", () => {
    expect(isAllowed("https://vidyalaya.in", "https://*.vidyalaya.in")).toBe(false);
  });

  it("supports a comma-separated list mixing exact origins and wildcards", () => {
    const allowed = "https://app.vidyalaya.in,https://*.vidyalaya.in";
    expect(isAllowed("https://app.vidyalaya.in", allowed)).toBe(true);
    expect(isAllowed("https://greenwood.vidyalaya.in", allowed)).toBe(true);
    expect(isAllowed("https://other.example.com", allowed)).toBe(false);
  });
});
