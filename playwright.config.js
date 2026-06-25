// Playwright config for the Glow CMS E2E suite.
//
// The suite is API/HTTP-driven (no browser binary needed): it exercises the real
// Next.js server over HTTP — minting a session, creating content, generating via
// the stubbed LLM, publishing, and fetching the rendered public page. Using only
// the `request` fixture keeps it fast and means CI doesn't need `playwright
// install` of browsers.
//
// `webServer` builds nothing here (CI / the local workflow run `npm run build`
// first) — it just starts `next start` on the test port with the test env:
//   GLOW_LLM_STUB=1  → offline deterministic generation, no API keys/credits
//   DB_*             → the disposable test database (seeded by global-setup)
//   NEXTAUTH_URL     → pin the auth base URL (http → non-secure session cookie)

import { defineConfig } from "@playwright/test";
import { TEST_BASE_URL, TEST_PORT } from "./e2e/helpers/env.js";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.js",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  timeout: 30_000,
  use: {
    baseURL: TEST_BASE_URL,
    extraHTTPHeaders: { "content-type": "application/json" },
  },
  webServer: {
    command: `npx next start -p ${TEST_PORT}`,
    url: TEST_BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      GLOW_LLM_STUB: "1",
      NEXTAUTH_URL: TEST_BASE_URL,
      DB_HOST: process.env.DB_HOST || "127.0.0.1",
      DB_USER: process.env.DB_USER || "root",
      DB_PASSWORD: process.env.DB_PASSWORD || "",
      DB_NAME: process.env.DB_NAME || "glow_cms",
      DB_PORT: process.env.DB_PORT || "3306",
    },
  },
});
