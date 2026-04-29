import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { validId, validString, err } from "@/lib/validate";
import { clearAllSnapshots } from "@/lib/pages";

export async function GET(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const { id } = await params;
    const [rows] = await pool.query("SELECT * FROM section_types WHERE id = ?", [id]);
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {

    const { id } = await params;
    const { name, default_content, variables } = await req.json();
    if (!validId(id)) return err("Invalid ID");
    if (!validString(name, 200)) return err("name is required (max 200 chars)");
    await pool.query("UPDATE section_types SET name=?, default_content=?, variables=? WHERE id=?", [name, default_content, JSON.stringify(variables || []), id]);
    clearAllSnapshots().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {

    const { id } = await params;
    await pool.query("DELETE FROM section_types WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
