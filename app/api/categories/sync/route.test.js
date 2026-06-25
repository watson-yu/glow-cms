import { describe, it, expect, vi, beforeEach } from "vitest";
import mysql from "mysql2/promise";

// The category sync wraps every L1/L2 upsert in withTransaction so that a
// mid-loop failure (an FK violation, or the categoryLocalId overflow guard
// throwing) rolls the whole table back rather than leaving it half-synced.
// We mock mysql2 so the REAL withTransaction and REAL categoryLocalId run
// against an in-memory connection — only the wire I/O is faked. createPool
// backs lib/db's pool (getExtConfig + the transaction connection); the route
// also opens an external connection via createConnection for the source rows.
vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn(), createConnection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
}));

import { POST } from "./route.js";

const EXT_CONFIG = [
  { config_key: "ext_db_host", config_value: "ext-host" },
  { config_key: "ext_db_name", config_value: "ext-db" },
  { config_key: "ext_db_user", config_value: "u" },
  { config_key: "ext_db_password", config_value: "p" },
  { config_key: "ext_db_port", config_value: "3306" },
];

// The local pool is created once and cached inside lib/db; reuse a stable object
// and just reconfigure its vi.fns each test. getConnection hands out a fresh
// transaction connection recorded in `conn`.
const pool = { query: vi.fn(), getConnection: vi.fn() };
const ext = { query: vi.fn(), end: vi.fn().mockResolvedValue(undefined) };
let conn;

function makeConn() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn().mockResolvedValue([[], []]),
  };
}

beforeEach(() => {
  process.env.DB_HOST = "localhost";
  process.env.DB_NAME = "test";

  pool.query.mockReset();
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("system_config")) return [EXT_CONFIG];
    return [[]];
  });
  pool.getConnection.mockReset();
  pool.getConnection.mockImplementation(async () => {
    conn = makeConn();
    return conn;
  });

  ext.query.mockReset();
  ext.end.mockClear();

  mysql.createPool.mockReset();
  mysql.createConnection.mockReset();
  mysql.createPool.mockReturnValue(pool);
  mysql.createConnection.mockResolvedValue(ext);
});

describe("POST /api/categories/sync — transaction success", () => {
  it("commits and reports the synced counts when every upsert succeeds", async () => {
    ext.query
      .mockResolvedValueOnce([[{ id: 1, name: "Skin", slug: "skin", sort_order: 0 }]]) // L1
      .mockResolvedValueOnce([[{ parent_id: 1, id: 5, name: "Peel", slug: "peel", display_order: 0 }]]); // L2

    const res = await POST({ json: async () => ({}) });

    expect(res.status).toBe(200);
    expect(res.body.synced).toEqual({ l1: 1, l2: 1 });
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
    expect(ext.end).toHaveBeenCalledTimes(1);
    // L2 child is keyed via categoryLocalId(1, 5) = 100005.
    const l2Insert = conn.query.mock.calls.find((c) => c[1] && c[1][0] === 100005);
    expect(l2Insert).toBeTruthy();
  });
});

describe("POST /api/categories/sync — rollback on mid-loop failure", () => {
  it("rolls back the whole sync when a child insert violates the FK", async () => {
    ext.query
      .mockResolvedValueOnce([[{ id: 1, name: "Skin", slug: "skin", sort_order: 0 }]]) // L1
      .mockResolvedValueOnce([
        [
          { parent_id: 1, id: 5, name: "Peel", slug: "peel", display_order: 0 },
          // parent_id 999 has no matching L1 row -> the FK insert fails mid-loop.
          { parent_id: 999, id: 7, name: "Orphan", slug: "orphan", display_order: 1 },
        ],
      ]); // L2

    pool.getConnection.mockImplementation(async () => {
      conn = makeConn();
      conn.query.mockImplementation(async (sql, params) => {
        // The L2 insert binds parent_id at index 4; simulate ER_NO_REFERENCED_ROW_2.
        if (sql.includes("INSERT") && params && params[4] === 999) {
          throw new Error("ER_NO_REFERENCED_ROW_2");
        }
        return [[], []];
      });
      return conn;
    });

    // The route has no catch around withTransaction, so the error propagates
    // after the transaction is rolled back and the external conn is closed.
    await expect(POST({ json: async () => ({}) })).rejects.toThrow("ER_NO_REFERENCED_ROW_2");

    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled(); // table left unchanged
    expect(conn.release).toHaveBeenCalledTimes(1);
    expect(ext.end).toHaveBeenCalledTimes(1); // finally still closes the source conn
  });

  it("rolls back when the categoryLocalId overflow guard throws inside the loop", async () => {
    ext.query
      .mockResolvedValueOnce([[{ id: 1, name: "Skin", slug: "skin", sort_order: 0 }]]) // L1
      .mockResolvedValueOnce([
        // treatment id >= L2_ID_MULTIPLIER -> categoryLocalId throws before any query.
        [{ parent_id: 1, id: 100000, name: "Bad", slug: "bad", display_order: 0 }],
      ]); // L2

    await expect(POST({ json: async () => ({}) })).rejects.toThrow(/collide/);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
    expect(ext.end).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/categories/sync — preconditions", () => {
  it("returns 400 and never opens the external connection when not configured", async () => {
    pool.query.mockImplementation(async () => [[]]); // no ext_db_host / ext_db_name
    const res = await POST({ json: async () => ({}) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not configured/);
    expect(mysql.createConnection).not.toHaveBeenCalled();
  });
});
