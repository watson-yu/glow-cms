import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const pageIds = new URL(req.url).searchParams.get("page_ids");
    if (pageIds) {
      const ids = pageIds.split(",").map(Number).filter(Boolean);
      if (!ids.length) return NextResponse.json([]);
      const [rows] = await pool.query("SELECT * FROM generation_jobs WHERE page_id IN (?) ORDER BY created_at DESC", [ids]);
      const latest = {};
      for (const r of rows) { if (!latest[r.page_id]) latest[r.page_id] = r; }
      return NextResponse.json(Object.values(latest));
    }
    // List all recent jobs with page title
    const [rows] = await pool.query(
      `SELECT gj.*, p.title as page_title, p.slug as page_slug
       FROM generation_jobs gj
       LEFT JOIN pages p ON gj.page_id = p.id
       ORDER BY gj.created_at DESC LIMIT 100`
    );
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
