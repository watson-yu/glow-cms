import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeHtml } from "@/lib/sanitize";
import { callLLM } from "@/lib/llm";

export async function POST(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const { provider, prompt, currentHtml, objectType, objectKey, imageData } = await req.json();
    if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });
    if (prompt.length > 10_000 || (currentHtml && currentHtml.length > 100_000)) {
      return NextResponse.json({ error: "Input too large" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`generate:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
    }

    try {
      const result = await callLLM({ provider, prompt, currentHtml, objectType, objectKey, imageData });
      return NextResponse.json({ html: sanitizeHtml(result.text) });
    } catch (e) {
      console.error("LLM generation error:", e);
      return NextResponse.json({ error: e.message || "Generation failed" }, { status: 500 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
