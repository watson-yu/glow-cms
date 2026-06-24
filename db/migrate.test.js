import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { listMigrationFiles, runMigrations } from "./migrate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function readMigration(file) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
}

// Strip line comments so guard/keyword checks ignore prose in comments.
function stripComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("migration SQL is idempotent", () => {
  const files = listMigrationFiles();

  it("ships migration files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of listMigrationFiles()) {
    describe(file, () => {
      const sql = stripComments(readMigration(file));

      // The runner is pointed at fresh installs bootstrapped from schema.sql,
      // where the objects already exist but schema_migrations is empty. A bare
      // `ALTER TABLE ... ADD COLUMN/CONSTRAINT` would then error on "duplicate
      // column"/"table exists". Idempotent migrations wrap every conditional
      // DDL inside dynamic SQL (`IF(@col_exists = 0, 'ALTER TABLE ...', ...)`),
      // so no statement should *start* with ALTER TABLE outside a quoted string.
      it("has no unguarded ALTER TABLE statement", () => {
        const offending = sql
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^ALTER\s+TABLE/i.test(l));
        expect(offending).toEqual([]);
      });

      it("guards every conditional DDL with an existence check", () => {
        // If the file performs an ADD COLUMN / ADD CONSTRAINT (even inside
        // dynamic SQL), it must consult information_schema to decide whether to.
        if (/ADD\s+COLUMN|ADD\s+CONSTRAINT/i.test(sql)) {
          expect(/information_schema/i.test(sql)).toBe(true);
        }
      });

      it("creates tables only with IF NOT EXISTS", () => {
        const creates = sql.match(/CREATE\s+TABLE(\s+IF\s+NOT\s+EXISTS)?/gi) || [];
        for (const c of creates) {
          expect(c.replace(/\s+/g, " ").toUpperCase()).toBe("CREATE TABLE IF NOT EXISTS");
        }
      });
    });
  }
});

// A fake MySQL connection that models just enough of schema_migrations to drive
// the runner: it remembers which filenames have been recorded and records every
// migration-body query it executes, so a test can assert the runner applies each
// file exactly once and a re-run is a clean no-op.
function makeFakeDb() {
  const appliedFilenames = [];
  const migrationQueries = [];
  const conn = {
    async query(sql, params) {
      const s = String(sql);
      if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(s)) return [[], []];
      if (/SELECT filename FROM schema_migrations/i.test(s)) {
        return [appliedFilenames.map((f) => ({ filename: f })), []];
      }
      if (/INSERT INTO schema_migrations/i.test(s)) {
        appliedFilenames.push(params[0]);
        return [{ affectedRows: 1 }, []];
      }
      // Anything else is a migration body being applied.
      migrationQueries.push(s);
      return [[], []];
    },
  };
  return { conn, appliedFilenames, migrationQueries };
}

describe("runMigrations is idempotent across runs", () => {
  it("applies every migration once, then re-runs as a clean no-op", async () => {
    const files = listMigrationFiles();
    const { conn, appliedFilenames, migrationQueries } = makeFakeDb();

    // First run: nothing applied yet, so all migrations run in order.
    const first = await runMigrations(conn);
    expect(first.applied).toEqual(files);
    expect(first.pending).toEqual([]);
    expect(appliedFilenames).toEqual(files);
    // Exactly one body query per migration file.
    expect(migrationQueries.length).toBe(files.length);

    const queriesAfterFirst = migrationQueries.length;

    // Second run: every file already recorded -> no body queries, no inserts.
    const second = await runMigrations(conn);
    expect(second.applied).toEqual([]);
    expect(second.pending).toEqual([]);
    expect(migrationQueries.length).toBe(queriesAfterFirst);
    expect(appliedFilenames).toEqual(files);
  });

  it("--status never applies anything and reports all pending on a fresh DB", async () => {
    const files = listMigrationFiles();
    const { conn, appliedFilenames, migrationQueries } = makeFakeDb();

    const res = await runMigrations(conn, { statusOnly: true });
    expect(res.applied).toEqual([]);
    expect(res.pending).toEqual(files);
    expect(migrationQueries.length).toBe(0);
    expect(appliedFilenames).toEqual([]);
  });
});
