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
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
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
