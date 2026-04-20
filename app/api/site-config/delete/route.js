import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req) {
  const { key } = await req.json();
  await pool.query("DELETE FROM site_config WHERE config_key = ?", [key]);
  return NextResponse.json({ ok: true });
}
