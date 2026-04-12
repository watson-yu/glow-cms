import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [rows] = await pool.query(`
    SELECT p.scope_type, p.scope_key,
      MAX(p.version) as latest_version,
      MAX(CASE WHEN p.is_active = 1 THEN p.version END) as active_version,
      MAX(CASE WHEN p.is_active = 1 THEN p.content END) as active_content,
      COUNT(*) as version_count
    FROM prompts p
    GROUP BY p.scope_type, p.scope_key
    ORDER BY FIELD(p.scope_type, 'system', 'object_type', 'object'), p.scope_key
  `);
  return NextResponse.json(rows);
}
