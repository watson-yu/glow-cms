import pool from "@/lib/db";
import { saveDbConfig } from "@/lib/db";
import { requireAuth, parseAllowedLogins } from "@/lib/auth";
import { NextResponse } from "next/server";

const SECRET_KEYS = ["aws_access_key", "aws_secret_key", "db_password", "google_client_secret", "nextauth_secret", "openai_api_key", "claude_api_key", "gemini_api_key", "ext_db_password"];

function mask(value) {
  if (!value || value.length <= 4) return "••••";
  return "••••••••" + value.slice(-4);
}

// Bootstrap route: required to enter the OAuth secrets before auth can be
// enforced, so it allows access while the instance is unconfigured. Once OAuth
// is configured it requires a valid allow-listed session like everything else.
export async function GET(req) {
  const denied = await requireAuth(req, { allowBootstrap: true });
  if (denied) return denied;
  return getConfigResponse();
}

async function getConfigResponse() {
  const [rows] = await pool.query("SELECT * FROM system_config");
  const config = {};
  // DB fields always come from live local config, never from system_config
  const dbKeys = new Set(Object.keys(DB_KEYS));
  for (const r of rows) {
    if (dbKeys.has(r.config_key)) continue;
    config[r.config_key] = SECRET_KEYS.includes(r.config_key)
      ? { masked: mask(r.config_value), hasValue: !!r.config_value }
      : r.config_value;
  }
  const { loadConfig } = await import("@/lib/db");
  const live = loadConfig();
  if (live) {
    config.db_host = live.host || "";
    config.db_port = String(live.port || 3306);
    config.db_user = live.user || "";
    config.db_name = live.database || "";
    if (live.password) config.db_password = { masked: mask(live.password), hasValue: true };
  }
  return NextResponse.json(config);
}

const DB_KEYS = { db_host: "host", db_port: "port", db_user: "user", db_password: "password", db_name: "database" };

export async function PUT(req) {
  const denied = await requireAuth(req, { allowBootstrap: true });
  if (denied) return denied;

  const data = await req.json();

  // Separate DB connection fields from regular config
  const dbFields = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    // Documented contract: empty/blank values for secret keys are skipped so a
    // "Change" → Save with the box left empty preserves the stored secret
    // (API key, AWS secret, DB password) instead of wiping it.
    if (SECRET_KEYS.includes(key) && (value === null || String(value).trim() === "")) continue;
    if (key in DB_KEYS) {
      dbFields[key] = value;
    } else {
      // Canonicalize the allow-list on save: accept commas and/or newlines on
      // input but store one entry per line, so the persisted value matches the
      // "one per line" UI hint and isEmailAllowed parses it identically.
      const stored = key === "allowed_logins" ? parseAllowedLogins(value).join("\n") : value;
      await pool.query("INSERT INTO system_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value=?", [key, stored, stored]);
    }
  }

  // Sync DB fields directly to .db-config.json (never stored in system_config)
  if (Object.keys(dbFields).length) {
    const { loadConfig } = await import("@/lib/db");
    const current = loadConfig() || {};
    for (const [key, value] of Object.entries(dbFields)) {
      const mapped = DB_KEYS[key];
      if (mapped) current[mapped] = mapped === "port" ? parseInt(value || "3306") : (value || "");
    }
    if (current.host && current.database) saveDbConfig(current);
  }

  return NextResponse.json({ ok: true });
}
