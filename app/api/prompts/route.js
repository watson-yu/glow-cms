import pool, { withTransaction } from "@/lib/db";
import { nextPromptVersion } from "@/lib/prompts";
import { NextResponse } from "next/server";

// GET /api/prompts?scope_key=xxx — get active + version history
// POST /api/prompts — save new version (auto-deactivates old)
export async function GET(req) {
  const key = req.nextUrl.searchParams.get("scope_key");
  if (!key) return NextResponse.json({ error: "scope_key required" }, { status: 400 });
  const [rows] = await pool.query(
    "SELECT id, scope_type, scope_key, version, content, is_active, created_at FROM prompts WHERE scope_key = ? ORDER BY version DESC",
    [key]
  );
  const active = rows.find(r => r.is_active) || null;
  return NextResponse.json({ active, versions: rows });
}

export async function POST(req) {
  const { scope_type, scope_key, content } = await req.json();
  if (!scope_key || !scope_type) return NextResponse.json({ error: "scope_type and scope_key required" }, { status: 400 });

  // The next-version SELECT, the deactivate, and the insert must be atomic:
  // concurrent saves would otherwise pick the same version (now blocked by the
  // UNIQUE(scope_key, version) constraint) and leave multiple is_active rows
  // (the active prompt drives every LLM call). FOR UPDATE serializes racing
  // writers so the second one sees the first's new max.
  const result = await withTransaction(async (conn) => {
    const [maxRow] = await conn.query(
      "SELECT COALESCE(MAX(version),0) as mv FROM prompts WHERE scope_key = ? FOR UPDATE",
      [scope_key]
    );
    const nextVersion = nextPromptVersion(maxRow[0].mv);

    await conn.query("UPDATE prompts SET is_active = 0 WHERE scope_key = ?", [scope_key]);

    const [r] = await conn.query(
      "INSERT INTO prompts (scope_type, scope_key, version, content, is_active) VALUES (?, ?, ?, ?, 1)",
      [scope_type, scope_key, nextVersion, content || ""]
    );
    return { id: r.insertId, version: nextVersion };
  });

  return NextResponse.json(result, { status: 201 });
}

// PUT /api/prompts — activate a specific version
export async function PUT(req) {
  const { scope_key, version } = await req.json();
  // Deactivate-then-activate must be atomic, else a mid-sequence failure could
  // leave the scope_key with zero active prompts.
  await withTransaction(async (conn) => {
    await conn.query("UPDATE prompts SET is_active = 0 WHERE scope_key = ?", [scope_key]);
    await conn.query("UPDATE prompts SET is_active = 1 WHERE scope_key = ? AND version = ?", [scope_key, version]);
  });
  return NextResponse.json({ ok: true });
}
