#!/usr/bin/env node
// Database initializer: stand up a brand-new database from scratch.
//
//   npm run db:init
//
// Two steps, in order:
//   1. Apply db/schema.sql — the from-scratch snapshot. It runs
//      `CREATE DATABASE IF NOT EXISTS glow_cms; USE glow_cms;` itself, so this
//      step connects WITHOUT selecting a database (the database may not exist
//      yet).
//   2. Run db/migrations/*.sql via the same runner as `npm run migrate`. The
//      migrations are idempotent, so re-running them against the freshly
//      schema-bootstrapped DB is a clean no-op for objects schema.sql already
//      created and applies anything newer.
//
// This is the entry point used by the E2E suite and CI to bring up a disposable
// test database. Connection config comes from lib/db.js loadConfig() (env vars
// or .db-config.json), exactly like the app and the migrate runner.
//
// NOTE: schema.sql hard-codes the database name `glow_cms`, so DB_NAME must be
// `glow_cms` for the migration step (which connects with the configured
// database) to target the same schema the snapshot created.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { loadConfig } from "../lib/db.js";
import { runMigrations } from "./migrate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

// Apply the from-scratch schema then run migrations. Pure with respect to its
// args so it can be driven from tests / global setup as well as the CLI.
export async function initDb({ log = () => {} } = {}) {
  const config = loadConfig();
  if (!config) {
    throw new Error(
      "No DB config found. Set DB_HOST/DB_NAME (and friends) or create .db-config.json first."
    );
  }

  // Step 1: schema.sql. Connect without a default database — schema.sql creates
  // and selects `glow_cms` itself, and the target database may not exist yet.
  const { database, ...connWithoutDb } = config;
  const schemaConn = await mysql.createConnection({ ...connWithoutDb, multipleStatements: true });
  try {
    // Pin the database collation to the one the mysql2 driver uses for its
    // connection (utf8mb4_unicode_ci). schema.sql declares no explicit charset,
    // so its tables inherit the database default; on a server whose default is
    // utf8mb4_0900_ai_ci (the MySQL 8.0 default, incl. the CI service
    // container) the columns would then be 0900_ai_ci while the driver sends
    // user variables as unicode_ci — and migration 005 compares the `content`
    // column against a `@hardened` user variable (both IMPLICIT), which throws
    // "Illegal mix of collations". Forcing the database default to unicode_ci
    // makes both sides agree. The ALTER also fixes a pre-existing database
    // (e.g. one the CI container auto-created as 0900) since schema.sql only
    // creates it IF NOT EXISTS. Both run before any table is created.
    await schemaConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await schemaConn.query(
      `ALTER DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    log("Applying db/schema.sql ...");
    await schemaConn.query(fs.readFileSync(SCHEMA_PATH, "utf-8"));
  } finally {
    await schemaConn.end();
  }

  // Step 2: migrations, against the configured database.
  const migConn = await mysql.createConnection({ ...config, multipleStatements: true });
  try {
    await runMigrations(migConn, { log });
  } finally {
    await migConn.end();
  }

  log("Database initialized.");
}

async function main() {
  await initDb({ log: (m) => console.log(m) });
}

// Only run as a CLI when invoked directly (node db/init.mjs), not when imported.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("\nDB init failed:", err.message);
    process.exit(1);
  });
}
