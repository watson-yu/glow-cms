import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), ".db-config.json");

let pool = null;

export function loadConfig() {
  // env vars take priority
  if (process.env.DB_HOST && process.env.DB_NAME) {
    return {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT || "3306"),
    };
  }
  // fall back to saved config file
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  return null;
}

export function saveDbConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  // reset pool so next call picks up new config
  pool = null;
}

export function isDbConfigured() {
  return !!loadConfig();
}

export function getPool() {
  if (pool) return pool;
  const config = loadConfig();
  if (!config) return null;
  pool = mysql.createPool({
    ...config,
    timezone: "+00:00",
    connectionLimit: 10,
    maxIdle: 5,
    idleTimeout: 60000,
  });
  return pool;
}

// MySQL error codes that mean "the transaction lost a lock race and was rolled
// back cleanly by the server" — safe to retry the whole unit of work.
const RETRYABLE_TX_ERRORS = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);
const MAX_TX_ATTEMPTS = 4;
const TX_BACKOFF_BASE_MS = 25;

function isRetryableTxError(err) {
  return !!err && RETRYABLE_TX_ERRORS.has(err.code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run `fn` inside a single DB transaction. `fn` receives a dedicated
// connection; on success the transaction commits, on any throw it rolls back.
// The connection is always released back to the pool.
//
// On a deadlock / lock-wait timeout the server has already rolled the
// transaction back, so we retry the whole `fn` a few times with small
// exponential backoff on a fresh connection. This is safe because every
// transactional route here builds its statements purely from its inputs, so
// re-running `fn` reproduces the same work — concurrent page publishes that
// would otherwise 500 with ER_LOCK_DEADLOCK now converge.
export async function withTransaction(fn) {
  const p = getPool();
  if (!p) throw new Error("DB_NOT_CONFIGURED");
  for (let attempt = 1; ; attempt++) {
    const conn = await p.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      try { await conn.rollback(); } catch { /* rollback best-effort */ }
      if (isRetryableTxError(err) && attempt < MAX_TX_ATTEMPTS) {
        await sleep(TX_BACKOFF_BASE_MS * attempt);
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

// Whether `table` exists in the current database. Used to degrade gracefully
// when a migration hasn't been applied yet (e.g. page_template_sections).
// Works with either the pool or a transaction connection.
export async function tableExists(executor, table) {
  const [rows] = await executor.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [table]
  );
  return rows.length > 0;
}

// Graceful shutdown — close pool on process exit and HMR reload
function shutdownPool() { if (pool) { pool.end().catch(() => {}); pool = null; } }
process.once("SIGTERM", shutdownPool);
process.once("SIGINT", shutdownPool);
if (typeof globalThis.__glowPoolCleanup === "function") globalThis.__glowPoolCleanup();
globalThis.__glowPoolCleanup = shutdownPool;

export default new Proxy({}, {
  get(_, prop) {
    const p = getPool();
    if (!p) throw new Error("DB_NOT_CONFIGURED");
    return p[prop];
  }
});
