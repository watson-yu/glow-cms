import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { validId, validString, validSlug, err } from "@/lib/validate";

export async function PUT(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const { id } = await params;
    if (!validId(id)) return err("Invalid ID");
    const { name, slug, sort_order, description } = await req.json();
    if (!validString(name, 200)) return err("name is required (max 200 chars)");
    if (slug && !validSlug(slug)) return err("slug must be lowercase alphanumeric with hyphens");
    await pool.query("UPDATE categories SET name=?, slug=?, sort_order=?, description=? WHERE id=?", [name, slug, sort_order ?? 0, description || null, id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const { id } = await params;
    await pool.query("DELETE FROM categories WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
