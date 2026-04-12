import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req, { params }) {
  const { id } = await params;
  const [rows] = await pool.query("SELECT * FROM section_types WHERE id = ?", [id]);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PUT(req, { params }) {
  const { id } = await params;
  const { name, default_content } = await req.json();
  await pool.query("UPDATE section_types SET name=?, default_content=? WHERE id=?", [name, default_content, id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  await pool.query("DELETE FROM section_types WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
