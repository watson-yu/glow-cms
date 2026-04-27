import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  const [rows] = await pool.query("SELECT * FROM section_types ORDER BY id");
  return NextResponse.json(rows);
}

export async function POST(req) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { name, default_content, variables } = await req.json();
  const [r] = await pool.query("INSERT INTO section_types (name, default_content, variables) VALUES (?, ?, ?)", [name, default_content, JSON.stringify(variables || [])]);
  return NextResponse.json({ id: r.insertId }, { status: 201 });
}
