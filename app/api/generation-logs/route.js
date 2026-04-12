import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [rows] = await pool.query(
    `SELECT id, provider, model, object_type, object_key,
      system_prompt_id, system_prompt_version,
      type_prompt_id, type_prompt_version,
      object_prompt_id, object_prompt_version,
      user_prompt, current_html, response_html, created_at
     FROM generation_logs ORDER BY created_at DESC LIMIT 100`
  );
  return NextResponse.json(rows);
}
