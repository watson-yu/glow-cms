// Shared test constants for the E2E suite. These are throwaway values used only
// to drive a disposable test database and a locally-minted session — they are
// NOT real credentials and must never be reused for anything else.

// Test admin identity and allow-list. The allow-list is seeded into
// system_config so the minted session for TEST_EMAIL passes isEmailAllowed().
export const TEST_EMAIL = "e2e@glow.test";
export const TEST_ALLOWED_LOGINS = "@glow.test";

// Throwaway NextAuth secret. Long enough to be a sane HKDF key; value is
// irrelevant beyond "the minted token and the running server agree on it".
export const TEST_NEXTAUTH_SECRET =
  "e2e-test-nextauth-secret-do-not-use-in-production-00000000";

// Public site settings the pipeline relies on. content_path puts published
// pages under /guides/<slug>; the template/header/footer only reference
// site_title, which is defined here so every {{ }} resolves (no leaks).
export const TEST_SITE_CONFIG = {
  site_title: "Glow E2E",
  site_description: "End-to-end test site for Glow CMS.",
  content_path: "/guides",
  site_lang: "en",
};

// The host:port the test server listens on. Kept distinct from the dev default
// (3000) so an E2E run never collides with a running `npm run dev`.
export const TEST_PORT = Number(process.env.E2E_PORT || 3100);
export const TEST_BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
