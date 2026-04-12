import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [rows] = await pool.query("SELECT * FROM site_config");
  const config = Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
  return NextResponse.json(config);
}

export async function PUT(req) {
  const data = await req.json();
  for (const [key, value] of Object.entries(data)) {
    await pool.query("INSERT INTO site_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value=?", [key, value, value]);
  }
  return NextResponse.json({ ok: true });
}
