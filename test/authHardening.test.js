import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lib/db so lib/auth's dynamic `import("@/lib/db")` resolves to a fake we
// can repoint between calls (simulating a runtime DB switch via saveDbConfig()).
vi.mock("@/lib/db", () => ({
  getPool: vi.fn(),
  isDbConfigured: vi.fn(() => true),
}));

import { getConfig, deriveSecureCookie } from "@/lib/auth";
import * as db from "@/lib/db";

beforeEach(() => {
  db.getPool.mockReset();
});

// F1: lib/auth must NOT cache the pool locally. saveDbConfig() nulls lib/db's
// pool on a runtime DB repoint; if lib/auth held a stale reference it would keep
// reading auth config from the OLD database. Each getConfig() must re-resolve.
describe("getConfig — pool is not cached locally (F1)", () => {
  it("picks up a repointed db pool on the next call", async () => {
    const poolA = { query: vi.fn(async () => [[{ config_value: "A" }]]) };
    const poolB = { query: vi.fn(async () => [[{ config_value: "B" }]]) };

    db.getPool.mockReturnValue(poolA);
    expect(await getConfig("nextauth_secret")).toBe("A");

    // DB repointed: lib/db now hands out a different pool.
    db.getPool.mockReturnValue(poolB);
    expect(await getConfig("nextauth_secret")).toBe("B");

    expect(db.getPool).toHaveBeenCalledTimes(2);
    expect(poolB.query).toHaveBeenCalledTimes(1);
  });

  it("re-resolves the pool on every call (no stale memo)", async () => {
    const pool = { query: vi.fn(async () => [[{ config_value: "x" }]]) };
    db.getPool.mockReturnValue(pool);
    await getConfig("a");
    await getConfig("b");
    await getConfig("c");
    expect(db.getPool).toHaveBeenCalledTimes(3);
  });
});

// F2: proxy/requireAuth (via isSecureRequest) and getServerSession must derive
// the same secureCookie flag, so getToken reads the same cookie name on both
// paths. The shared helper takes whichever https signal each caller has.
describe("deriveSecureCookie — shared https derivation (F2)", () => {
  it("is secure when x-forwarded-proto is https (proxied deploy)", () => {
    expect(deriveSecureCookie({ forwardedProto: "https" })).toBe(true);
  });

  it("is insecure when x-forwarded-proto is http", () => {
    expect(deriveSecureCookie({ forwardedProto: "http" })).toBe(false);
  });

  // The proxy/requireAuth path: no proxy header, but the request URL is https.
  it("falls back to the request protocol (direct-HTTPS, requireAuth path)", () => {
    expect(deriveSecureCookie({ forwardedProto: "", protocolFallback: "https:" })).toBe(true);
  });

  // The getServerSession path: no proxy header and no request URL, but the
  // browser presented the __Secure- session cookie → the origin is https.
  it("falls back to the secure-cookie presence (direct-HTTPS, getServerSession path)", () => {
    expect(deriveSecureCookie({ forwardedProto: "", hasSecureCookie: true })).toBe(true);
  });

  it("is insecure with no https signal at all", () => {
    expect(deriveSecureCookie({})).toBe(false);
    expect(deriveSecureCookie({ forwardedProto: "", protocolFallback: "http:", hasSecureCookie: false })).toBe(false);
  });
});
