#!/usr/bin/env node
// Database initializer: the ONE command that takes a brand-new database to fully
// up to date. It applies db/schema.sql (the from-scratch snapshot) and then runs
// the migration runner (db/migrate.mjs), in that order, against the configured DB.
//
// Why this exists: `npm run migrate` alone on an empty database fails confusingly
// — migration 001 is an `ALTER TABLE page_templates ...` that assumes the table
// already exists, which it only does after schema.sql has been applied. The fix
// is not "make migrate create tables" (it stays an upgrade tool) but to provide a
// single front door for first-time setup:
//
//   npm run db:init          # schema.sql, then all migrations -> DB fully ready
//
// Idempotent and safe to re-run. schema.sql uses CREATE TABLE IF NOT EXISTS and
// WHERE NOT EXISTS / ON DUPLICATE KEY seeds; migrations are guarded and recorded
// in schema_migrations. So on an already-initialized DB this is a clean no-op.
//
// Connection config comes from lib/db.js loadConfig() (env vars or
// .db-config.json), exactly like the app and the migrator. For Node scripts you
// can also pass `--env-file=.env.local`.
//
// schema.sql opens with `CREATE DATABASE IF NOT EXISTS glow_cms;` / `USE
// glow_cms;`. When connecting directly to an existing database (the common case:
// a managed DB whose name differs from glow_cms, or a user who can't CREATE
// DATABASE), those lines are wrong — we already hold a connection to the target
// schema. So we strip them and let the connection's own `database` decide where
// the objects land. See stripSchemaPreamble().

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { loadConfig } from "../lib/db.js";
import { runMigrations } from "./migrate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

// Remove the leading `CREATE DATABASE ...` and `USE ...` statements from the
// schema snapshot so it can be applied over an already-open connection to the
// target database — whatever that database is named, and even when the
// connecting user lacks CREATE DATABASE privilege. Every other statement is
// returned unchanged. Pure string function so it can be unit-tested without a DB.
export function stripSchemaPreamble(sql) {
  // Split on top-level semicolons. schema.sql contains no stored
  // routines/triggers/DELIMITER, so a naive `;` split is correct here.
  return sql
    .split(";")
    .map((stmt) => stmt.trim())
    .filter(Boolean)
    .filter((stmt) => !/^CREATE\s+DATABASE\b/i.test(stmt))
    .filter((stmt) => !/^USE\b/i.test(stmt))
    .map((stmt) => stmt + ";")
    .join("\n");
}

// Apply the schema snapshot (preamble stripped) over an existing connection.
// `conn` must have multipleStatements enabled. Returns the SQL that was run.
export async function applySchema(conn, schemaSql) {
  const sql = stripSchemaPreamble(schemaSql);
  if (sql.trim()) await conn.query(sql);
  return sql;
}

// Full initialization against a live connection: schema first, then migrations.
// Pure with respect to its `conn` argument so it can be driven by a fake DB in
// tests. Returns what the migration runner reports.
export async function initDatabase(conn, { log = () => {} } = {}) {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf-8");
  log("Applying db/schema.sql (from-scratch snapshot) ...");
  await applySchema(conn, schemaSql);
  log("Schema applied. Running migrations ...");
  return runMigrations(conn, { log });
}

async function main() {
  const config = loadConfig();
  if (!config) {
    console.error(
      "No DB config found. Set DB_HOST/DB_NAME (and friends) or create .db-config.json first.\n" +
        "Tip: node --env-file=.env.local db/init.mjs"
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({ ...config, multipleStatements: true });
  try {
    const { applied } = await initDatabase(conn, { log: (m) => console.log(m) });
    if (applied.length) {
      console.log(`\nDatabase initialized: schema applied, ${applied.length} migration(s) run.`);
    } else {
      console.log("\nDatabase already initialized — schema and migrations are up to date (no-op).");
    }
  } finally {
    await conn.end();
  }
}

// Only run as a CLI when invoked directly (node db/init.mjs), not when imported
// (e.g. by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("\nDatabase init failed:", err.message);
    process.exit(1);
  });
}
