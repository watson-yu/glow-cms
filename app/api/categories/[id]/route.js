import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function PUT(req, { params }) {
  const { id } = await params;
  const { name, slug, sort_order, description } = await req.json();
  await pool.query("UPDATE categories SET name=?, slug=?, sort_order=?, description=? WHERE id=?", [name, slug, sort_order ?? 0, description || null, id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  await pool.query("DELETE FROM categories WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
