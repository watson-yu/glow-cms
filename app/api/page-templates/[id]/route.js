import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req, { params }) {
  const { id } = await params;
  const [rows] = await pool.query("SELECT * FROM page_templates WHERE id = ?", [id]);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PUT(req, { params }) {
  const { id } = await params;
  const { name, content } = await req.json();
  await pool.query("UPDATE page_templates SET name=?, content=? WHERE id=?", [name, content, id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  await pool.query("DELETE FROM page_templates WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
