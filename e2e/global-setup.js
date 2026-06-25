// Playwright global setup: bring up a clean, fully-configured test database
// before any spec runs. Runs once per `npm run test:e2e` invocation.
//
//   1. db:init  — apply schema.sql + migrations (idempotent; safe to re-run).
//   2. reset    — truncate all content tables for a deterministic starting state.
//   3. seed     — OAuth secret + allow-list + stub LLM key (system_config) and
//                 public site settings (site_config).
//
// The running app server reads this config fresh from MySQL (short TTL cache),
// so seeding here — in the Playwright runner process, before any test request —
// is picked up by the server process for every test.

import { getConnection, initTestDb, resetContent, seedSystemConfig, seedSiteConfig } from "./helpers/db.js";

export default async function globalSetup() {
  await initTestDb();
  const conn = await getConnection();
  try {
    await resetContent(conn);
    await seedSystemConfig(conn);
    await seedSiteConfig(conn);
  } finally {
    await conn.end();
  }
}
