import { buildLoginThrottleKey } from "./login-throttle-key.js";

describe("buildLoginThrottleKey", () => {
  it("includes both the tracker (IP) and the lowercased, trimmed email", () => {
    expect(buildLoginThrottleKey("1.2.3.4", { email: "  Admin@Demo.Vidyalaya.In  " })).toBe(
      "login:1.2.3.4:admin@demo.vidyalaya.in",
    );
  });

  it("produces different keys for different emails behind the same IP", () => {
    const a = buildLoginThrottleKey("1.2.3.4", { email: "teacher-a@demo.vidyalaya.in" });
    const b = buildLoginThrottleKey("1.2.3.4", { email: "teacher-b@demo.vidyalaya.in" });
    expect(a).not.toBe(b);
  });

  it("produces different keys for the same email from different IPs", () => {
    const a = buildLoginThrottleKey("1.2.3.4", { email: "admin@demo.vidyalaya.in" });
    const b = buildLoginThrottleKey("5.6.7.8", { email: "admin@demo.vidyalaya.in" });
    expect(a).not.toBe(b);
  });

  it("falls back to a fixed placeholder when the body has no string email", () => {
    expect(buildLoginThrottleKey("1.2.3.4", {})).toBe("login:1.2.3.4:unknown");
    expect(buildLoginThrottleKey("1.2.3.4", undefined)).toBe("login:1.2.3.4:unknown");
    expect(buildLoginThrottleKey("1.2.3.4", { email: 12345 })).toBe("login:1.2.3.4:unknown");
  });
});
