import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generatePageVariables } from "@/lib/generate-page";

export async function POST(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const { page_ids } = await req.json();
    if (!Array.isArray(page_ids) || !page_ids.length) return NextResponse.json({ error: "page_ids required" }, { status: 400 });

    // Create a batch job record for tracking
    const [batchResult] = await pool.query(
      "INSERT INTO generation_jobs (page_id, status, sections_total) VALUES (0, 'running', ?)",
      [page_ids.length]
    );
    const batchId = batchResult.insertId;

    // Respond immediately, process in background
    const response = NextResponse.json({ ok: true, batchId });

    // Background processing (continues after response)
    (async () => {
      let done = 0;
      for (const pid of page_ids) {
        try {
          await generatePageVariables(pid);
          done++;
        } catch (e) {
          console.error(`Batch generation failed for page ${pid}:`, e.message);
        }
        await pool.query("UPDATE generation_jobs SET sections_done = ? WHERE id = ?", [done, batchId]);
      }
      await pool.query(
        "UPDATE generation_jobs SET status = ?, completed_at = NOW() WHERE id = ?",
        [done === page_ids.length ? "completed" : (done > 0 ? "completed" : "failed"), batchId]
      );
    })();

    return response;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
