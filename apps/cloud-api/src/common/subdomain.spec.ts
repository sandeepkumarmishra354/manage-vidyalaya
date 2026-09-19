import { deriveSubdomainFromRequest } from "./subdomain.js";

function reqWith(headers: Record<string, string | string[] | undefined>) {
  return { headers };
}

describe("deriveSubdomainFromRequest", () => {
  it("extracts the subdomain from the Origin header", () => {
    expect(deriveSubdomainFromRequest(reqWith({ origin: "https://greenwood.vidyalaya.in" }))).toBe("greenwood");
  });

  it("falls back to the Referer header when Origin is absent", () => {
    expect(
      deriveSubdomainFromRequest(reqWith({ referer: "https://greenwood.vidyalaya.in/login" })),
    ).toBe("greenwood");
  });

  it("prefers Origin over Referer when both are present", () => {
    expect(
      deriveSubdomainFromRequest(
        reqWith({ origin: "https://greenwood.vidyalaya.in", referer: "https://stmarys.vidyalaya.in/login" }),
      ),
    ).toBe("greenwood");
  });

  it("returns undefined when neither header is present", () => {
    expect(deriveSubdomainFromRequest(reqWith({}))).toBeUndefined();
  });

  it("returns undefined for localhost", () => {
    expect(deriveSubdomainFromRequest(reqWith({ origin: "http://localhost:5173" }))).toBeUndefined();
  });

  it("returns undefined for a bare IP", () => {
    expect(deriveSubdomainFromRequest(reqWith({ origin: "http://127.0.0.1:5173" }))).toBeUndefined();
  });

  it("returns undefined for the bare apex domain", () => {
    expect(deriveSubdomainFromRequest(reqWith({ origin: "https://vidyalaya.in" }))).toBeUndefined();
  });

  it("returns undefined for a shared/generic host label", () => {
    expect(deriveSubdomainFromRequest(reqWith({ origin: "https://app.vidyalaya.in" }))).toBeUndefined();
    expect(deriveSubdomainFromRequest(reqWith({ origin: "https://www.vidyalaya.in" }))).toBeUndefined();
  });

  it("lowercases the subdomain", () => {
    expect(deriveSubdomainFromRequest(reqWith({ origin: "https://Greenwood.vidyalaya.in" }))).toBe("greenwood");
  });

  it("does not span more than one subdomain level", () => {
    expect(deriveSubdomainFromRequest(reqWith({ origin: "https://foo.bar.vidyalaya.in" }))).toBe("foo");
  });

  it("returns undefined for an unparseable header value", () => {
    expect(deriveSubdomainFromRequest(reqWith({ origin: "not-a-url" }))).toBeUndefined();
  });

  it("uses the first value when a header arrives as an array", () => {
    expect(
      deriveSubdomainFromRequest(reqWith({ origin: ["https://greenwood.vidyalaya.in", "https://stmarys.vidyalaya.in"] })),
    ).toBe("greenwood");
  });
});
