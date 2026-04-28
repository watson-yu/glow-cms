import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const pageIds = new URL(req.url).searchParams.get("page_ids");
    if (!pageIds) return NextResponse.json([]);
    const ids = pageIds.split(",").map(Number).filter(Boolean);
    if (!ids.length) return NextResponse.json([]);
    const [rows] = await pool.query(
      `SELECT * FROM generation_jobs WHERE page_id IN (?) ORDER BY created_at DESC`,
      [ids]
    );
    // Return latest job per page_id
    const latest = {};
    for (const r of rows) {
      if (!latest[r.page_id]) latest[r.page_id] = r;
    }
    return NextResponse.json(Object.values(latest));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
