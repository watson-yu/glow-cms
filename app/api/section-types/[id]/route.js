import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const [rows] = await pool.query("SELECT * FROM section_types WHERE id = ?", [id]);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PUT(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const { name, default_content, variables } = await req.json();
  await pool.query("UPDATE section_types SET name=?, default_content=?, variables=? WHERE id=?", [name, default_content, JSON.stringify(variables || []), id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  await pool.query("DELETE FROM section_types WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
