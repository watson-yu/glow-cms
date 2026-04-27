import pool from "@/lib/db";
import { getPool } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// GET /api/prompts?scope_key=xxx — get active + version history
// POST /api/prompts — save new version (auto-deactivates old)
export async function GET(req) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const key = req.nextUrl.searchParams.get("scope_key");
    if (!key) return NextResponse.json({ error: "scope_key required" }, { status: 400 });
    const [rows] = await pool.query(
      "SELECT id, scope_type, scope_key, version, content, is_active, created_at FROM prompts WHERE scope_key = ? ORDER BY version DESC",
      [key]
    );
    const active = rows.find(r => r.is_active) || null;
    return NextResponse.json({ active, versions: rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {

    const { scope_type, scope_key, content } = await req.json();
    if (!scope_key || !scope_type) return NextResponse.json({ error: "scope_type and scope_key required" }, { status: 400 });

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const [maxRow] = await conn.query("SELECT COALESCE(MAX(version),0) as mv FROM prompts WHERE scope_key = ?", [scope_key]);
      const nextVersion = maxRow[0].mv + 1;
      await conn.query("UPDATE prompts SET is_active = 0 WHERE scope_key = ?", [scope_key]);
      const [r] = await conn.query(
        "INSERT INTO prompts (scope_type, scope_key, version, content, is_active) VALUES (?, ?, ?, ?, 1)",
        [scope_type, scope_key, nextVersion, content || ""]
      );
      await conn.commit();
      return NextResponse.json({ id: r.insertId, version: nextVersion }, { status: 201 });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/prompts — activate a specific version
export async function PUT(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {

    const { scope_key, version } = await req.json();
    await pool.query("UPDATE prompts SET is_active = 0 WHERE scope_key = ?", [scope_key]);
    await pool.query("UPDATE prompts SET is_active = 1 WHERE scope_key = ? AND version = ?", [scope_key, version]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
