import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [rows] = await pool.query("SELECT * FROM section_types ORDER BY id");
  return NextResponse.json(rows);
}

export async function POST(req) {
  const { name, default_content } = await req.json();
  const [r] = await pool.query("INSERT INTO section_types (name, default_content) VALUES (?, ?)", [name, default_content]);
  return NextResponse.json({ id: r.insertId }, { status: 201 });
}
