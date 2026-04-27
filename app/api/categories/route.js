import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { validString, validSlug, err } from "@/lib/validate";

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const [rows] = await pool.query("SELECT * FROM categories ORDER BY sort_order, name");
    const parents = rows.filter(r => !r.parent_id);
    const tree = parents.map(p => ({ ...p, children: rows.filter(r => r.parent_id === p.id) }));
    return NextResponse.json(tree);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const { name, slug, parent_id } = await req.json();
    if (!validString(name, 200)) return err("name is required (max 200 chars)");
    if (slug && !validSlug(slug)) return err("slug must be lowercase alphanumeric with hyphens");
    if (parent_id) {
      const [parent] = await pool.query("SELECT parent_id FROM categories WHERE id = ?", [parent_id]);
      if (!parent.length) return NextResponse.json({ error: "Parent not found" }, { status: 400 });
      if (parent[0].parent_id) return NextResponse.json({ error: "Max 2 levels" }, { status: 400 });
    }
    const [result] = await pool.query(
      "INSERT INTO categories (name, slug, parent_id) VALUES (?, ?, ?)",
      [name, slug, parent_id || null]
    );
    return NextResponse.json({ id: result.insertId }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
