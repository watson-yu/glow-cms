import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const [rows] = await pool.query("SELECT * FROM site_config");
    const config = Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
    return NextResponse.json(config);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const data = await req.json();
    for (const [key, value] of Object.entries(data)) {
      await pool.query("INSERT INTO site_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value=?", [key, value, value]);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
