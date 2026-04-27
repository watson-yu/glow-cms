import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  const [rows] = await pool.query("SELECT * FROM headers ORDER BY id");
  return NextResponse.json(rows);
}

export async function POST(req) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { name, content } = await req.json();
  const [r] = await pool.query("INSERT INTO headers (name, content) VALUES (?, ?)", [name, content]);
  return NextResponse.json({ id: r.insertId }, { status: 201 });
}
