import { describe, it, expect, vi, beforeEach } from "vitest";
import mysql from "mysql2/promise";

// Mock mysql2/promise so getPool() never opens a real connection.
vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn() },
}));

import { withTransaction } from "./db.js";

function makeConn() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn().mockResolvedValue([[], []]),
  };
}

// One pool is created lazily and cached inside db.js. Its getConnection always
// hands out a fresh connection and records it in `lastConn`, so every test can
// inspect the connection used by its withTransaction call.
let lastConn;

beforeEach(() => {
  process.env.DB_HOST = "localhost";
  process.env.DB_NAME = "test";
  mysql.createPool.mockReturnValue({
    getConnection: vi.fn(async () => {
      lastConn = makeConn();
      return lastConn;
    }),
  });
});

describe("withTransaction", () => {
  it("commits on success, never rolls back, and releases the connection", async () => {
    const result = await withTransaction(async (conn) => {
      await conn.query("UPDATE x SET y=1");
      return 42;
    });

    expect(result).toBe(42);
    expect(lastConn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(lastConn.commit).toHaveBeenCalledTimes(1);
    expect(lastConn.rollback).not.toHaveBeenCalled();
    expect(lastConn.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back on throw, never commits, releases, and rethrows", async () => {
    await expect(
      withTransaction(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(lastConn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(lastConn.commit).not.toHaveBeenCalled();
    expect(lastConn.rollback).toHaveBeenCalledTimes(1);
    expect(lastConn.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back the delete when a section insert fails (section-replacement path)", async () => {
    // Mirrors the delete-then-insert sequence in the page/template routes:
    // the DELETE succeeds but the bulk INSERT throws, so the whole unit must
    // roll back rather than leave the page's sections wiped.
    const insertError = new Error("ER_DATA_TOO_LONG");

    await expect(
      withTransaction(async (conn) => {
        await conn.query("DELETE FROM sections WHERE page_id = ?", [1]);
        conn.query.mockRejectedValueOnce(insertError);
        await conn.query("INSERT INTO sections (...) VALUES ?", [[]]);
      })
    ).rejects.toThrow("ER_DATA_TOO_LONG");

    // DELETE was issued, but the transaction is rolled back (not committed),
    // so the delete is undone.
    expect(lastConn.query).toHaveBeenCalledWith(
      "DELETE FROM sections WHERE page_id = ?",
      [1]
    );
    expect(lastConn.rollback).toHaveBeenCalledTimes(1);
    expect(lastConn.commit).not.toHaveBeenCalled();
    expect(lastConn.release).toHaveBeenCalledTimes(1);
  });
});
