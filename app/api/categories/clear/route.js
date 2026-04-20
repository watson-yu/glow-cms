import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST() {
  await pool.query("DELETE FROM categories WHERE parent_id IS NOT NULL");
  await pool.query("DELETE FROM categories");
  return NextResponse.json({ ok: true });
}
