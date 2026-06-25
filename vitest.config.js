import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror the `@/*` -> `./*` path alias from jsconfig.json so tests can import
// modules the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // The Playwright E2E suite lives in e2e/ and uses *.spec.js; it must be run
    // with `npm run test:e2e`, never collected by Vitest (its test.beforeAll /
    // @playwright/test fixtures are incompatible with the Vitest runner).
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
  },
});
