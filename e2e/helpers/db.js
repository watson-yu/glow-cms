// Direct-MySQL helpers for the E2E suite: stand up the schema, seed the
// privileged config that the HTTP flow can't bootstrap once OAuth is locked,
// and reset content tables between runs so each test starts from a clean slate.
//
// Privileged config (the OAuth secret, allow-list, site settings) is written
// directly to MySQL here rather than over HTTP: it has to exist *before* the
// session-gated content flow runs, and writing it directly keeps the test from
// depending on the bootstrap-window quirk of /api/system-config.

import { execFileSync } from "node:child_process";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  TEST_ALLOWED_LOGINS,
  TEST_BASE_URL,
  TEST_NEXTAUTH_SECRET,
  TEST_SITE_CONFIG,
} from "./env.js";

// Connection config from the same source the app uses (env vars). The E2E run
// sets DB_HOST/DB_NAME=glow_cms/etc before invoking Playwright.
export function dbConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "glow_cms",
    port: Number(process.env.DB_PORT || 3306),
  };
}

export async function getConnection() {
  return mysql.createConnection({ ...dbConfig(), multipleStatements: true });
}

// Apply schema.sql + migrations against the test database by running the real
// `db:init` CLI as a subprocess. We shell out rather than import db/init.mjs
// directly because Playwright transpiles the test files to CommonJS, which
// cannot evaluate the `import.meta` the .mjs entrypoint uses.
export async function initTestDb() {
  const script = path.join(process.cwd(), "db", "init.mjs");
  execFileSync(process.execPath, [script], { env: process.env, stdio: "inherit" });
}

// Content tables, child-first so a plain TRUNCATE order would also be valid; we
// disable FK checks anyway to be order-independent.
const CONTENT_TABLES = [
  "generation_logs",
  "sections",
  "pages",
  "page_template_sections",
  "page_templates",
  "section_types",
  "headers",
  "footers",
  "categories",
];

// Wipe all content so each test run is deterministic. Leaves config tables
// (site_config / system_config / prompts) intact — those are (re)seeded below.
export async function resetContent(conn) {
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of CONTENT_TABLES) {
    await conn.query(`TRUNCATE TABLE ${t}`);
  }
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function upsertConfig(conn, table, entries) {
  for (const [key, value] of Object.entries(entries)) {
    await conn.query(
      `INSERT INTO ${table} (config_key, config_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
      [key, value]
    );
  }
}

// Seed the OAuth secret + allow-list (so the minted session is accepted and the
// instance counts as "configured" → the auth gate is actually exercised) and a
// stub LLM key (the stub provider ignores it, but the route still checks a key
// is present unless GLOW_LLM_STUB is set — seeding it keeps the path robust).
export async function seedSystemConfig(conn) {
  await upsertConfig(conn, "system_config", {
    google_client_id: "e2e-test-client-id",
    google_client_secret: "e2e-test-client-secret",
    nextauth_secret: TEST_NEXTAUTH_SECRET,
    allowed_logins: TEST_ALLOWED_LOGINS,
    gemini_api_key: "e2e-stub-key",
  });
}

export async function seedSiteConfig(conn) {
  await upsertConfig(conn, "site_config", {
    ...TEST_SITE_CONFIG,
    base_url: TEST_BASE_URL,
  });
}
