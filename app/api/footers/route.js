import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [rows] = await pool.query("SELECT * FROM footers ORDER BY id");
  return NextResponse.json(rows);
}

export async function POST(req) {
  const { name, content } = await req.json();
  const [r] = await pool.query("INSERT INTO footers (name, content) VALUES (?, ?)", [name, content]);
  return NextResponse.json({ id: r.insertId }, { status: 201 });
}
