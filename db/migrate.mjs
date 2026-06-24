#!/usr/bin/env node
// Migration runner: applies db/migrations/*.sql in filename order and records
// each applied file in a `schema_migrations` table so it runs exactly once.
//
// This is what keeps db/schema.sql and db/migrations/ from drifting: schema.sql
// is the from-scratch snapshot for fresh installs; every change to it MUST also
// ship as a numbered, idempotent migration here so existing databases converge.
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

function listMigrationFiles() {
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
    await ensureMigrationsTable(conn);
    const applied = await appliedSet(conn);
    const files = listMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));

    if (statusOnly) {
      console.log(`Migrations in ${MIGRATIONS_DIR}:`);
      for (const f of files) console.log(`  ${applied.has(f) ? "[applied]" : "[pending]"} ${f}`);
      if (!files.length) console.log("  (none)");
      return;
    }

    if (!pending.length) {
      console.log("No pending migrations. Database is up to date.");
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      process.stdout.write(`Applying ${file} ... `);
      await conn.query(sql);
      await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
      console.log("done");
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message);
  process.exit(1);
});
