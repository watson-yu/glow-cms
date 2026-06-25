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
// hands out a fresh connection and records it in `lastConn` (and the full
// sequence in `conns`), so every test can inspect the connection(s) used by its
// withTransaction call.
let lastConn;
let conns;

beforeEach(() => {
  process.env.DB_HOST = "localhost";
  process.env.DB_NAME = "test";
  conns = [];
  mysql.createPool.mockReturnValue({
    getConnection: vi.fn(async () => {
      lastConn = makeConn();
      conns.push(lastConn);
      return lastConn;
    }),
  });
});

// Build an Error carrying a MySQL driver `code`, like mysql2 surfaces.
function dbError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

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

  it("retries the whole fn on ER_LOCK_DEADLOCK, then commits", async () => {
    let calls = 0;
    const result = await withTransaction(async () => {
      calls += 1;
      if (calls === 1) throw dbError("ER_LOCK_DEADLOCK");
      return "ok";
    });

    // fn ran twice: deadlocked once, then succeeded.
    expect(calls).toBe(2);
    expect(result).toBe("ok");
    // A fresh connection per attempt, each rolled back / committed and released.
    expect(conns).toHaveLength(2);
    expect(conns[0].rollback).toHaveBeenCalledTimes(1);
    expect(conns[0].commit).not.toHaveBeenCalled();
    expect(conns[0].release).toHaveBeenCalledTimes(1);
    expect(conns[1].commit).toHaveBeenCalledTimes(1);
    expect(conns[1].rollback).not.toHaveBeenCalled();
    expect(conns[1].release).toHaveBeenCalledTimes(1);
  });

  it("also retries on ER_LOCK_WAIT_TIMEOUT", async () => {
    let calls = 0;
    const result = await withTransaction(async () => {
      calls += 1;
      if (calls === 1) throw dbError("ER_LOCK_WAIT_TIMEOUT");
      return calls;
    });
    expect(result).toBe(2);
    expect(conns).toHaveLength(2);
  });

  it("does NOT retry a non-deadlock error — rolls back once and rethrows", async () => {
    let calls = 0;
    await expect(
      withTransaction(async () => {
        calls += 1;
        throw dbError("ER_DATA_TOO_LONG");
      })
    ).rejects.toMatchObject({ code: "ER_DATA_TOO_LONG" });

    expect(calls).toBe(1);
    expect(conns).toHaveLength(1);
    expect(lastConn.rollback).toHaveBeenCalledTimes(1);
    expect(lastConn.commit).not.toHaveBeenCalled();
    expect(lastConn.release).toHaveBeenCalledTimes(1);
  });

  it("gives up after a bounded number of deadlock retries and rethrows", async () => {
    let calls = 0;
    await expect(
      withTransaction(async () => {
        calls += 1;
        throw dbError("ER_LOCK_DEADLOCK");
      })
    ).rejects.toMatchObject({ code: "ER_LOCK_DEADLOCK" });

    // Bounded attempts (not infinite): one initial try + a few retries.
    expect(calls).toBe(4);
    expect(conns).toHaveLength(4);
    for (const c of conns) {
      expect(c.commit).not.toHaveBeenCalled();
      expect(c.rollback).toHaveBeenCalledTimes(1);
      expect(c.release).toHaveBeenCalledTimes(1);
    }
  });
});
