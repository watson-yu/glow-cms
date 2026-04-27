import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function POST(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {

    const { key } = await req.json();
    await pool.query("DELETE FROM site_config WHERE config_key = ?", [key]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
