import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function POST() {
  const authError = await requireAuth();
  if (authError) return authError;

  await pool.query("DELETE FROM categories WHERE parent_id IS NOT NULL");
  await pool.query("DELETE FROM categories");
  return NextResponse.json({ ok: true });
}
