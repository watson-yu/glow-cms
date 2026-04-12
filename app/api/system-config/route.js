import pool from "@/lib/db";
import { NextResponse } from "next/server";

const SECRET_KEYS = ["aws_access_key", "aws_secret_key", "db_password", "google_client_secret", "openai_api_key", "claude_api_key", "gemini_api_key"];

function mask(value) {
  if (!value || value.length <= 4) return "••••";
  return "••••••••" + value.slice(-4);
}

export async function GET() {
  const [rows] = await pool.query("SELECT * FROM system_config");
  const config = {};
  for (const r of rows) {
    config[r.config_key] = SECRET_KEYS.includes(r.config_key)
      ? { masked: mask(r.config_value), hasValue: !!r.config_value }
      : r.config_value;
  }
  return NextResponse.json(config);
}

export async function PUT(req) {
  const data = await req.json();
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    await pool.query("INSERT INTO system_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value=?", [key, value, value]);
  }
  return NextResponse.json({ ok: true });
}
