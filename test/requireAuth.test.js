import { describe, it, expect } from "vitest";
import { decideAccess } from "@/lib/auth";

// decideAccess is the pure core of requireAuth()/the proxy gate: given the
// server-derived auth state, it decides whether a request may proceed. The IO
// wrappers (requireAuth, authorizeRequest) only feed it config from MySQL and
// the email from the verified session token.

const ALLOW = "admin@pro360.com.tw\n@pro360.com.tw";

describe("decideAccess — high-risk route gate", () => {
  it("denies an unauthenticated request when OAuth is configured", () => {
    expect(decideAccess({ configured: true, email: null, allowedLogins: ALLOW })).toBe(false);
  });

  it("denies a session whose email is not on the allow-list", () => {
    expect(decideAccess({ configured: true, email: "attacker@evil.com", allowedLogins: ALLOW })).toBe(false);
  });

  it("allows an allow-listed session", () => {
    expect(decideAccess({ configured: true, email: "admin@pro360.com.tw", allowedLogins: ALLOW })).toBe(true);
    expect(decideAccess({ configured: true, email: "anyone@pro360.com.tw", allowedLogins: ALLOW })).toBe(true);
  });

  it("denies even an authenticated session when the allow-list is empty (fail closed)", () => {
    expect(decideAccess({ configured: true, email: "admin@pro360.com.tw", allowedLogins: "" })).toBe(false);
  });

  it("fails closed for non-bootstrap routes when OAuth is unconfigured", () => {
    expect(decideAccess({ configured: false, allowBootstrap: false, email: null, allowedLogins: "" })).toBe(false);
  });

  it("permits bootstrap routes while OAuth is unconfigured", () => {
    expect(decideAccess({ configured: false, allowBootstrap: true, email: null, allowedLogins: "" })).toBe(true);
  });

  it("still enforces auth on bootstrap routes once OAuth is configured", () => {
    expect(decideAccess({ configured: true, allowBootstrap: true, email: null, allowedLogins: ALLOW })).toBe(false);
  });
});
