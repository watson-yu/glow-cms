import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { stripSchemaPreamble, applySchema, initDatabase } from "./init.mjs";
import { listMigrationFiles } from "./migrate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf-8");

describe("stripSchemaPreamble", () => {
  it("removes the leading CREATE DATABASE and USE statements", () => {
    const out = stripSchemaPreamble(schemaSql);
    expect(/CREATE\s+DATABASE/i.test(out)).toBe(false);
    // `USE glow_cms;` must be gone, but column/table bodies are untouched.
    expect(/^\s*USE\s+/im.test(out)).toBe(false);
  });

  it("keeps the actual schema objects and seeds", () => {
    const out = stripSchemaPreamble(schemaSql);
    expect(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+page_templates/i.test(out)).toBe(true);
    expect(/INSERT\s+INTO\s+page_templates/i.test(out)).toBe(true);
  });

  it("is a no-op for SQL that has no preamble", () => {
    const sql = "CREATE TABLE IF NOT EXISTS t (id INT);";
    expect(stripSchemaPreamble(sql).trim()).toBe("CREATE TABLE IF NOT EXISTS t (id INT);");
  });

  it("does not strip non-leading USE-prefixed identifiers", () => {
    // A column or table whose name merely starts with "use" must survive.
    const sql = "CREATE TABLE users (id INT);\nUSE other_db;";
    const out = stripSchemaPreamble(sql);
    expect(/CREATE\s+TABLE\s+users/i.test(out)).toBe(true);
    expect(/^\s*USE\s+other_db/im.test(out)).toBe(false);
  });
});

// A fake MySQL connection that records every query and models just enough of
// schema_migrations for the migration runner. Lets us assert init's ordering
// (schema before migrations) and idempotency without a live database.
function makeFakeDb() {
  const applied = [];
  const queries = [];
  const conn = {
    async query(sql, params) {
      const s = String(sql);
      if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(s)) return [[], []];
      if (/SELECT filename FROM schema_migrations/i.test(s)) {
        return [applied.map((f) => ({ filename: f })), []];
      }
      if (/INSERT INTO schema_migrations/i.test(s)) {
        applied.push(params[0]);
        return [{ affectedRows: 1 }, []];
      }
      queries.push(s);
      return [[], []];
    },
  };
  return { conn, applied, queries };
}

describe("applySchema", () => {
  it("runs the preamble-stripped schema as a single multi-statement query", async () => {
    const { conn, queries } = makeFakeDb();
    const ran = await applySchema(conn, schemaSql);
    expect(queries.length).toBe(1);
    expect(queries[0]).toBe(ran);
    expect(/CREATE\s+DATABASE/i.test(queries[0])).toBe(false);
    expect(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(queries[0])).toBe(true);
  });
});

describe("initDatabase", () => {
  it("applies schema first, then every migration, and is a clean no-op on re-run", async () => {
    const files = listMigrationFiles();
    const { conn, applied, queries } = makeFakeDb();

    const first = await initDatabase(conn);
    // schema body query is recorded before any migration body query.
    expect(queries.length).toBeGreaterThan(0);
    expect(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(queries[0])).toBe(true);
    expect(first.applied).toEqual(files);
    expect(applied).toEqual(files);

    const queriesAfterFirst = queries.length;

    // Second run: schema re-applies (idempotent CREATE/INSERT IF NOT EXISTS) but
    // no migration is recorded twice.
    const second = await initDatabase(conn);
    expect(second.applied).toEqual([]);
    expect(applied).toEqual(files);
    // Only the schema query was re-issued, no new migration bodies.
    expect(queries.length).toBe(queriesAfterFirst + 1);
  });
});
