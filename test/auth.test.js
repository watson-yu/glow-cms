import { describe, it, expect } from "vitest";
import { isEmailAllowed, parseAllowedLogins } from "@/lib/auth";

describe("isEmailAllowed", () => {
  // S8: an empty/blank allow-list must FAIL CLOSED (deny), never grant any
  // Google account admin.
  it("denies everyone when the allow-list is empty", () => {
    expect(isEmailAllowed("anyone@gmail.com", "")).toBe(false);
  });

  it("denies when the allow-list is only whitespace/blank lines", () => {
    expect(isEmailAllowed("anyone@gmail.com", "   \n  \n\t")).toBe(false);
  });

  it("denies when the email is empty even if rules exist", () => {
    expect(isEmailAllowed("", "admin@pro360.com.tw")).toBe(false);
    expect(isEmailAllowed(null, "admin@pro360.com.tw")).toBe(false);
    expect(isEmailAllowed(undefined, "admin@pro360.com.tw")).toBe(false);
  });

  it("matches an exact address", () => {
    expect(isEmailAllowed("admin@pro360.com.tw", "admin@pro360.com.tw")).toBe(true);
    expect(isEmailAllowed("other@pro360.com.tw", "admin@pro360.com.tw")).toBe(false);
  });

  it("matches a @domain suffix rule for any address in that domain", () => {
    expect(isEmailAllowed("anyone@pro360.com.tw", "@pro360.com.tw")).toBe(true);
    expect(isEmailAllowed("someone.else@pro360.com.tw", "@pro360.com.tw")).toBe(true);
    expect(isEmailAllowed("attacker@evil.com", "@pro360.com.tw")).toBe(false);
  });

  it("does not let a domain rule match a lookalike suffix outside the domain", () => {
    // "@pro360.com.tw" must not match "evil-pro360.com.tw" as a domain.
    expect(isEmailAllowed("user@evilpro360.com.tw", "@pro360.com.tw")).toBe(false);
  });

  it("is case-insensitive on both the email and the rules", () => {
    expect(isEmailAllowed("Admin@Pro360.com.tw", "admin@pro360.com.tw")).toBe(true);
    expect(isEmailAllowed("admin@pro360.com.tw", "ADMIN@PRO360.COM.TW")).toBe(true);
    expect(isEmailAllowed("USER@PRO360.COM.TW", "@pro360.com.tw")).toBe(true);
  });

  it("supports multiple newline-separated rules mixing exact and domain", () => {
    const rules = "ceo@pro360.com.tw\n@partner.example\nops@vendor.io";
    expect(isEmailAllowed("ceo@pro360.com.tw", rules)).toBe(true);
    expect(isEmailAllowed("anybody@partner.example", rules)).toBe(true);
    expect(isEmailAllowed("ops@vendor.io", rules)).toBe(true);
    expect(isEmailAllowed("nope@pro360.com.tw", rules)).toBe(false);
  });

  it("ignores blank lines and surrounding whitespace within the list", () => {
    const rules = "\n   admin@pro360.com.tw  \n\n";
    expect(isEmailAllowed("admin@pro360.com.tw", rules)).toBe(true);
  });

  // Regression: a comma-pasted allow-list must not collapse into one unmatchable
  // rule and fail-closed-lock-out every admin. The captain's real list is the
  // comma-separated form below.
  it("accepts a comma-separated allow-list (the real captain's list)", () => {
    const rules = "@pro360.com.tw,watsonyu@gmail.com,glow360app@gmail.com";
    expect(isEmailAllowed("anyone@pro360.com.tw", rules)).toBe(true);
    expect(isEmailAllowed("watsonyu@gmail.com", rules)).toBe(true);
    expect(isEmailAllowed("glow360app@gmail.com", rules)).toBe(true);
    expect(isEmailAllowed("attacker@evil.com", rules)).toBe(false);
  });

  it("accepts a comma-separated list with surrounding spaces", () => {
    const rules = "admin@pro360.com.tw, ops@vendor.io ,  ceo@pro360.com.tw";
    expect(isEmailAllowed("admin@pro360.com.tw", rules)).toBe(true);
    expect(isEmailAllowed("ops@vendor.io", rules)).toBe(true);
    expect(isEmailAllowed("ceo@pro360.com.tw", rules)).toBe(true);
    expect(isEmailAllowed("nope@pro360.com.tw", rules)).toBe(false);
  });

  it("accepts @domain rules inside a comma-separated list", () => {
    const rules = "@pro360.com.tw, @partner.example, ops@vendor.io";
    expect(isEmailAllowed("someone@pro360.com.tw", rules)).toBe(true);
    expect(isEmailAllowed("anybody@partner.example", rules)).toBe(true);
    expect(isEmailAllowed("ops@vendor.io", rules)).toBe(true);
    expect(isEmailAllowed("nobody@evil.com", rules)).toBe(false);
  });

  it("accepts a mix of commas and newlines as separators", () => {
    const rules = "@pro360.com.tw,watsonyu@gmail.com\nglow360app@gmail.com\nops@vendor.io, ceo@pro360.com.tw";
    expect(isEmailAllowed("hi@pro360.com.tw", rules)).toBe(true);
    expect(isEmailAllowed("watsonyu@gmail.com", rules)).toBe(true);
    expect(isEmailAllowed("glow360app@gmail.com", rules)).toBe(true);
    expect(isEmailAllowed("ops@vendor.io", rules)).toBe(true);
    expect(isEmailAllowed("ceo@pro360.com.tw", rules)).toBe(true);
    expect(isEmailAllowed("attacker@evil.com", rules)).toBe(false);
  });

  it("still fails closed when the list is only separators/whitespace", () => {
    expect(isEmailAllowed("anyone@gmail.com", ",")).toBe(false);
    expect(isEmailAllowed("anyone@gmail.com", " , , \n , ")).toBe(false);
    expect(isEmailAllowed("admin@pro360.com.tw", ",,,")).toBe(false);
  });
});

describe("parseAllowedLogins", () => {
  it("splits on commas and newlines, trims, lowercases, drops empties", () => {
    expect(parseAllowedLogins("@pro360.com.tw, Watson@Gmail.com\n\n ops@vendor.io ,"))
      .toEqual(["@pro360.com.tw", "watson@gmail.com", "ops@vendor.io"]);
  });

  it("returns an empty array for blank or separator-only input", () => {
    expect(parseAllowedLogins("")).toEqual([]);
    expect(parseAllowedLogins(null)).toEqual([]);
    expect(parseAllowedLogins(undefined)).toEqual([]);
    expect(parseAllowedLogins(" , \n , ")).toEqual([]);
  });
});
