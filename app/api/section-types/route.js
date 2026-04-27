import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { validString, err } from "@/lib/validate";

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const [rows] = await pool.query("SELECT * FROM section_types ORDER BY id");
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const { name, default_content, variables } = await req.json();
    if (!validString(name, 200)) return err("name is required (max 200 chars)");
    const [r] = await pool.query("INSERT INTO section_types (name, default_content, variables) VALUES (?, ?, ?)", [name, default_content, JSON.stringify(variables || [])]);
    return NextResponse.json({ id: r.insertId }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
