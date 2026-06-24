#!/usr/bin/env node
// Migration runner: applies db/migrations/*.sql in filename order and records
// each applied file in a `schema_migrations` table so it runs exactly once.
//
// This is what keeps db/schema.sql and db/migrations/ from drifting: schema.sql
// is the from-scratch snapshot for fresh installs; every change to it MUST also
// ship as a numbered, idempotent migration here so existing databases converge.
//
// Two layers of idempotency make re-running safe:
//   1. schema_migrations records every applied filename, so a file is never
//      applied twice in the same database.
//   2. Each migration's SQL is itself idempotent (information_schema guards,
//      CREATE TABLE IF NOT EXISTS, dynamic ADD COLUMN/CONSTRAINT). This is what
//      lets the runner be pointed at a fresh install bootstrapped from
//      schema.sql — where the objects already exist but schema_migrations is
//      empty — without erroring on "duplicate column"/"table exists".
//
//   npm run migrate          # apply all pending migrations
//   npm run migrate -- --status   # list applied / pending without applying
//
// Connection config comes from lib/db.js loadConfig() (env vars or
// .db-config.json), exactly like the app.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { loadConfig } from "../lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // zero-padded numeric prefixes sort lexicographically == numerically
}

async function ensureMigrationsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename VARCHAR(255) PRIMARY KEY,
       applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`
  );
}

async function appliedSet(conn) {
  const [rows] = await conn.query("SELECT filename FROM schema_migrations");
  return new Set(rows.map((r) => r.filename));
}

// Apply every pending migration exactly once, recording each in
// schema_migrations. Returns { applied, pending } describing what was run (or,
// in statusOnly mode, what is still pending). Pure with respect to its `conn`
// argument so tests can drive it with a fake connection.
export async function runMigrations(conn, { statusOnly = false, log = () => {} } = {}) {
  await ensureMigrationsTable(conn);
  const applied = await appliedSet(conn);
  const files = listMigrationFiles();
  const pending = files.filter((f) => !applied.has(f));

  if (statusOnly) {
    log(`Migrations in ${MIGRATIONS_DIR}:`);
    for (const f of files) log(`  ${applied.has(f) ? "[applied]" : "[pending]"} ${f}`);
    if (!files.length) log("  (none)");
    return { applied: [], pending };
  }

  if (!pending.length) {
    log("No pending migrations. Database is up to date.");
    return { applied: [], pending: [] };
  }

  const done = [];
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    log(`Applying ${file} ... `);
    await conn.query(sql);
    await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
    done.push(file);
  }
  log(`Applied ${done.length} migration(s).`);
  return { applied: done, pending: [] };
}

async function main() {
  const statusOnly = process.argv.includes("--status");

  const config = loadConfig();
  if (!config) {
    console.error(
      "No DB config found. Set DB_HOST/DB_NAME (and friends) or create .db-config.json first."
    );
    process.exit(1);
  }

  // multipleStatements so a single migration file (which may contain several
  // statements, incl. PREPARE/EXECUTE guards) runs as one query.
  const conn = await mysql.createConnection({ ...config, multipleStatements: true });
  try {
    await runMigrations(conn, { statusOnly, log: (m) => console.log(m) });
  } finally {
    await conn.end();
  }
}

// Only run as a CLI when invoked directly (node db/migrate.mjs), not when this
// module is imported (e.g. by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("\nMigration failed:", err.message);
    process.exit(1);
  });
}
