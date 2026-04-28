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

    let done = 0, failed = 0;
    for (const pid of page_ids) {
      try {
        await generatePageVariables(pid);
        done++;
      } catch (e) {
        console.error(`Batch generation failed for page ${pid}:`, e.message);
        failed++;
      }
    }

    return NextResponse.json({ ok: true, done, failed, total: page_ids.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
