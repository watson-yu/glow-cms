// Mint a NextAuth session cookie for the E2E suite.
//
// Interactive Google sign-in cannot be scripted, so the tests authenticate the
// same way the proven bootstrap scripts did: by minting the exact JWE session
// token NextAuth itself would issue. `next-auth/jwt`'s `encode` derives its
// encryption key from `secret` (HKDF, empty salt) — identical to what `getToken`
// uses to decode — so a token minted here with the test `NEXTAUTH_SECRET` and an
// allow-listed email is accepted by `proxy.js` / `requireAuth` as a real session.
//
// The secret here is a throwaway test value (see e2e/helpers/env.js); NEVER a
// real credential.

import { encode } from "next-auth/jwt";
import { TEST_EMAIL, TEST_NEXTAUTH_SECRET } from "./env.js";

// On http://localhost (no TLS) NextAuth uses the non-secure cookie name; the
// app's deriveSecureCookie() agrees because there is no https signal.
export const SESSION_COOKIE_NAME = "next-auth.session-token";

// Build the `Cookie:` header value carrying a valid session for `email`.
export async function mintSessionCookieHeader(email = TEST_EMAIL, secret = TEST_NEXTAUTH_SECRET) {
  const token = await encode({
    token: { name: "E2E Admin", email, sub: email, picture: null },
    secret,
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}
