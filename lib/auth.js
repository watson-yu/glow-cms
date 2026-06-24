// Server-side authentication gate for Glow CMS.
//
// Auth is "optional until configured": when Google OAuth is fully configured in
// `system_config`, every admin API route, admin page, and preview requires a
// valid, allow-listed NextAuth session. This module is the single source of
// truth for that decision — it is re-evaluated SERVER-side on every request and
// never trusts the client.
//
// It runs on the Node.js runtime (via `proxy.js` and API route handlers) because
// the OAuth secret and the allow-list live in MySQL, which is unreachable from
// the Edge runtime.

import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";

// Resolve lib/db's pool fresh on every call. lib/db memoizes it internally, so
// this is free — and crucially it RESPECTS a runtime DB repoint: saveDbConfig()
// (via /api/db-setup) nulls lib/db's pool, so a stale local cache here would keep
// reading auth config from the OLD database after the rest of the app moved on.
async function getPool() {
  return (await import("@/lib/db")).getPool();
}

export async function getConfig(key) {
  const p = await getPool();
  if (!p) return "";
  const [rows] = await p.query("SELECT config_value FROM system_config WHERE config_key = ?", [key]);
  return rows[0]?.config_value || "";
}

/**
 * Decide whether `email` is permitted by the newline-separated `allowedLogins`
 * allow-list. FAILS CLOSED: an empty/blank allow-list denies everyone, so a
 * fresh OAuth setup cannot silently grant admin to any Google account.
 *
 * Rules are case-insensitive. A rule beginning with "@" matches any address in
 * that domain (suffix match); any other rule is an exact-address match.
 */
export function isEmailAllowed(email, allowedLogins) {
  const rules = (allowedLogins || "")
    .split("\n")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (!rules.length) return false; // fail closed: no allow-list entries → deny
  if (!email) return false;
  const lower = email.toLowerCase();
  return rules.some(rule =>
    rule.startsWith("@") ? lower.endsWith(rule) : lower === rule
  );
}

// Short in-process cache so the per-request gate does not hammer MySQL.
let cache = null;
const CACHE_TTL_MS = 5000;

/**
 * Read the auth-relevant config from `system_config` and derive whether OAuth is
 * configured. The instance counts as "auth configured" only when all three
 * OAuth secrets are present. The allow-list deliberately does NOT gate this flag
 * (an empty allow-list keeps the instance gated but lets no one in, rather than
 * flipping it back to open — see isEmailAllowed).
 */
export async function getAuthConfig() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  if (!isDbConfigured()) {
    const value = { configured: false, secret: "", allowedLogins: "" };
    cache = { at: Date.now(), value };
    return value;
  }
  const [clientId, clientSecret, secret, allowedLogins] = await Promise.all([
    getConfig("google_client_id"),
    getConfig("google_client_secret"),
    getConfig("nextauth_secret"),
    getConfig("allowed_logins"),
  ]);
  const configured = !!(clientId && clientSecret && secret);
  const value = { configured, secret, allowedLogins };
  cache = { at: Date.now(), value };
  return value;
}

export async function isOAuthConfigured() {
  return (await getAuthConfig()).configured;
}

// Default name NextAuth gives the session cookie on a secure (https) origin.
const SECURE_SESSION_COOKIE = "__Secure-next-auth.session-token";

/**
 * Decide whether getToken() should look for the SECURE (__Secure-prefixed)
 * session cookie. A reverse proxy advertises the original scheme via
 * `x-forwarded-proto`; a direct-HTTPS deploy with no L7 proxy sends no such
 * header, so we fall back to a second https signal — the request's own protocol
 * where available (proxy/requireAuth path), or the presence of the secure cookie
 * itself (getServerSession path, which has no request URL). Both gate paths MUST
 * agree, otherwise getToken reads the wrong cookie name and a legitimate admin's
 * /preview/* 404s even though the proxy admitted them.
 */
export function deriveSecureCookie({ forwardedProto = "", protocolFallback = "", hasSecureCookie = false } = {}) {
  const proto = forwardedProto || protocolFallback || "";
  if (proto.includes("https")) return true;
  return !!hasSecureCookie;
}

function isSecureRequest(req) {
  return deriveSecureCookie({
    forwardedProto: req.headers.get("x-forwarded-proto") || "",
    protocolFallback: req.nextUrl?.protocol || "",
  });
}

async function getSessionEmail(req, secret) {
  const token = await getToken({ req, secret, secureCookie: isSecureRequest(req) });
  return token?.email || null;
}

/**
 * Used by `proxy.js` to authorize an arbitrary matched request.
 * Returns { configured, ok }. When `configured` is false the instance is open
 * (initial-setup state); callers should still independently fail-closed on
 * high-risk routes via requireAuth().
 */
export async function authorizeRequest(req) {
  const { configured, secret, allowedLogins } = await getAuthConfig();
  if (!configured) return { configured: false, ok: true };
  const email = await getSessionEmail(req, secret);
  return { configured: true, ok: isEmailAllowed(email, allowedLogins) };
}

function deny(message) {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Pure authorization decision (no IO) — the heart of the gate, kept separate so
 * it is trivially unit-testable.
 *
 * - OAuth configured  → allow only an allow-listed session email.
 * - OAuth unconfigured → allow only bootstrap routes (system-config, db-setup);
 *   everything else fails closed.
 */
export function decideAccess({ configured, allowBootstrap = false, email, allowedLogins }) {
  if (!configured) return !!allowBootstrap;
  return isEmailAllowed(email, allowedLogins);
}

/**
 * Defense-in-depth guard called at the top of high-risk route handlers. Returns
 * a 401 NextResponse to return early, or null when the request may proceed.
 *
 * - When OAuth is configured: requires a valid, allow-listed session — always.
 * - When OAuth is NOT configured: secret/resource routes (upload, generate,
 *   categories/sync) FAIL CLOSED and deny. The two bootstrap routes that must
 *   work before OAuth exists (system-config, db-setup) pass `allowBootstrap`
 *   so the instance can be configured in the first place. An unconfigured
 *   instance must therefore never be exposed to an untrusted network — see
 *   AGENT.md "Auth Flow".
 */
export async function requireAuth(req, { allowBootstrap = false } = {}) {
  const { configured, secret, allowedLogins } = await getAuthConfig();
  const email = configured ? await getSessionEmail(req, secret) : null;
  if (decideAccess({ configured, allowBootstrap, email, allowedLogins })) return null;
  return deny(
    configured
      ? "Authentication required."
      : "Authentication required: configure Google OAuth before using this endpoint."
  );
}

/**
 * Resolve the NextAuth base URL WITHOUT trusting arbitrary request headers.
 * Prefers the deploy-time NEXTAUTH_URL env var. If absent, auto-detection is
 * only allowed when the request host is explicitly allow-listed via
 * NEXTAUTH_TRUSTED_HOSTS (comma-separated). Returns null when nothing trusted
 * matches, so callers never derive a URL from an attacker-controlled Host.
 */
export function resolveAuthUrl(req) {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  const allowed = (process.env.NEXTAUTH_TRUSTED_HOSTS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return null;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !allowed.includes(host)) return null;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/**
 * Server Component guard. Reads the session from the request cookies (via
 * next/headers) and reports whether the caller is an allow-listed admin.
 * Returns { configured, allowed }. When OAuth is unconfigured `configured` is
 * false and the page may render (open instance); otherwise render gated content
 * only when `allowed` is true.
 */
export async function getServerSession() {
  const { configured, secret, allowedLogins } = await getAuthConfig();
  if (!configured) return { configured: false, allowed: false, email: null };
  const { cookies, headers } = await import("next/headers");
  const [cookieStore, hdrs] = await Promise.all([cookies(), headers()]);
  const secureCookie = deriveSecureCookie({
    forwardedProto: hdrs.get("x-forwarded-proto") || "",
    hasSecureCookie: typeof cookieStore.has === "function" && cookieStore.has(SECURE_SESSION_COOKIE),
  });
  const token = await getToken({ req: { cookies: cookieStore, headers: {} }, secret, secureCookie });
  const email = token?.email || null;
  return { configured: true, allowed: isEmailAllowed(email, allowedLogins), email };
}

// Test seam: reset the in-process config cache.
export function __resetAuthCache() {
  cache = null;
}
