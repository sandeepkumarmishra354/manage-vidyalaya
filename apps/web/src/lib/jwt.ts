// Minimal, non-verifying decode of a JWT's payload -- used only to read
// display-only claims (iat, for "active since" in the header) from our own
// already-trusted access token. No signature check: never use this to
// validate or trust a token from anywhere else.
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const [, payloadB64] = token.split(".");
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}

export function getTokenIssuedAt(token: string): Date | null {
  const payload = decodeJwtPayload<{ iat?: number }>(token);
  return payload?.iat ? new Date(payload.iat * 1000) : null;
}
