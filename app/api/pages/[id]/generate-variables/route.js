import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generatePageVariables } from "@/lib/generate-page";

export async function POST(req, { params }) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const { id } = await params;
    const result = await generatePageVariables(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
