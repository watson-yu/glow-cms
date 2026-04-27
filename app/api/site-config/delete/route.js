import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function POST(req) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { key } = await req.json();
  await pool.query("DELETE FROM site_config WHERE config_key = ?", [key]);
  return NextResponse.json({ ok: true });
}
