// Scopes the login rate-limit bucket to (source IP, target email) rather
// than IP alone -- an attacker guessing one account's password gets
// capped regardless of which staff email they're trying, but it doesn't
// also lock out every other staff member logging into their own account
// from behind the same school's shared NAT IP. Extracted as a pure
// function so the key derivation can be unit tested without booting a
// full Nest request/guard pipeline (mirrors common/cors.ts's
// patternToRegExp/buildCorsOptions split).
export function buildLoginThrottleKey(trackerString: string, requestBody: unknown): string {
  const email =
    typeof (requestBody as { email?: unknown })?.email === "string"
      ? (requestBody as { email: string }).email.trim().toLowerCase()
      : "unknown";
  return `login:${trackerString}:${email}`;
}
