import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { callLLM } from "@/lib/llm";
import { planSectionTokens, buildGenPrompt } from "@/lib/section-vars";

/**
 * Auto-fill ONE section's variables for the editor's per-section "Re-generate" button.
 * Auto-discovers every {{token}} in the section type's template (declared or not),
 * resolves context tokens like {{category}}, and asks the LLM to write the rest.
 * Returns the resolved values WITHOUT saving — the editor merges them into the form.
 */
export async function POST(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const { sectionTypeId, categoryId, variables = {}, variable_origins = {} } = await req.json();
    if (!sectionTypeId) return NextResponse.json({ error: "sectionTypeId required" }, { status: 400 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`generate:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
    }

    const [types] = await pool.query("SELECT default_content, variables FROM section_types WHERE id = ?", [sectionTypeId]);
    if (!types.length) return NextResponse.json({ error: "Section type not found" }, { status: 404 });
    const typeVars = (() => { try { return JSON.parse(types[0].variables || "[]"); } catch { return []; } })();

    // Category + site context.
    const ctx = { category: "", parent_category: "", category_description: "", parent_category_description: "", title: "", slug: "" };
    if (categoryId) {
      const [catRows] = await pool.query(
        "SELECT c.name, c.description, p.name AS parent_name, p.description AS parent_description FROM categories c LEFT JOIN categories p ON c.parent_id = p.id WHERE c.id = ?",
        [categoryId]
      );
      if (catRows.length) {
        ctx.category = catRows[0].name || "";
        ctx.category_description = catRows[0].description || "";
        ctx.parent_category = catRows[0].parent_name || "";
        ctx.parent_category_description = catRows[0].parent_description || "";
      }
    }
    const [siteRows] = await pool.query("SELECT config_key, config_value FROM site_config");
    const siteConfig = Object.fromEntries(siteRows.map(r => [r.config_key, r.config_value]));
    ctx.site_title = siteConfig.site_title || "";
    const siteKeys = new Set(Object.keys(siteConfig));

    const { contextUpdates, contentToGenerate } = planSectionTokens({
      defaultContent: types[0].default_content,
      typeVars, vars: variables, origins: variable_origins, ctx, siteKeys,
      shouldGenerate: (k, src) => src !== "manual", // regenerate everything not hand-edited
    });

    const values = { ...contextUpdates };
    if (contentToGenerate.length) {
      const result = await callLLM({ prompt: buildGenPrompt(ctx, contentToGenerate), objectType: "variable_generation", objectKey: `section_type:${sectionTypeId}` });
      const clean = result.text.replace(/```json?\n?|\n?```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(clean); } catch { return NextResponse.json({ error: "Generation returned invalid JSON" }, { status: 502 }); }
      const wanted = new Set(contentToGenerate.map(v => v.key));
      for (const k of Object.keys(parsed)) if (wanted.has(k)) values[k] = parsed[k];
    }

    return NextResponse.json({ values });
  } catch (e) {
    console.error("generate-section error:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
