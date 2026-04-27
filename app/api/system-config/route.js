import pool from "@/lib/db";
import { saveDbConfig } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

const SECRET_KEYS = ["aws_access_key", "aws_secret_key", "db_password", "google_client_secret", "nextauth_secret", "openai_api_key", "claude_api_key", "gemini_api_key", "ext_db_password"];

function mask(value) {
  if (!value || value.length <= 4) return "••••";
  return "••••••••" + value.slice(-4);
}

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

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
  const authError = await requireAuth();
  if (authError) return authError;

  const data = await req.json();

  // Separate DB connection fields from regular config
  const dbFields = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (key in DB_KEYS) {
      dbFields[key] = value;
    } else {
      if (SECRET_KEYS.includes(key) && !value) continue;
      await pool.query("INSERT INTO system_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value=?", [key, value, value]);
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
