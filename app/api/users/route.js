import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [rows] = await pool.query("SELECT id, email, name, image, role, last_login, created_at FROM users ORDER BY last_login DESC");
  return NextResponse.json(rows);
}
