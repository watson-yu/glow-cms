import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM generation_logs");
    const [rows] = await pool.query(
      `SELECT id, provider, model, object_type, object_key,
        system_prompt_id, system_prompt_version,
        type_prompt_id, type_prompt_version,
        object_prompt_id, object_prompt_version,
        user_prompt, current_html, response_html, created_at
       FROM generation_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return NextResponse.json({ rows, total, page, limit });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
