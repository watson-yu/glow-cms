import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { substituteVars } from "@/lib/template";

export async function POST(req, { params }) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const { id } = await params;

    // Fetch page with category
    const [pages] = await pool.query(
      "SELECT p.title, p.slug, p.category_id, c.name as category_name FROM pages p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?",
      [id]
    );
    if (!pages.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const page = pages[0];
    const ctx = { category: page.category_name || "", title: page.title || "", slug: page.slug || "" };

    // Fetch sections with type_variables
    const [sections] = await pool.query(
      "SELECT s.id, s.variables, s.variable_origins, st.variables as type_variables FROM sections s JOIN section_types st ON s.section_type_id = st.id WHERE s.page_id = ? ORDER BY s.sort_order",
      [id]
    );

    let generated = 0;
    for (const sec of sections) {
      const typeVars = (() => { try { return JSON.parse(sec.type_variables || "[]"); } catch { return []; } })();
      const vars = (() => { try { return JSON.parse(sec.variables || "{}"); } catch { return {}; } })();
      const origins = (() => { try { return JSON.parse(sec.variable_origins || "{}"); } catch { return {}; } })();

      const toGenerate = typeVars.filter(v => (v.type || "prompt") === "prompt" && v.label && origins[v.key] !== "manual");
      if (!toGenerate.length) continue;

      const prompt = toGenerate.map(v => `- ${v.key}: ${substituteVars(v.label, ctx)}`).join("\n");

      // Call /api/generate internally via fetch to reuse prompt chain + logging
      const baseUrl = req.nextUrl.origin;
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({
          provider: "gemini",
          prompt: `Generate short text values for the following variables. Return ONLY a JSON object with the keys and generated string values, no markdown fences.\n\n${prompt}`,
          currentHtml: "",
          objectType: null,
          objectKey: null,
        }),
      });
      const data = await res.json();
      if (data.error) continue;

      try {
        const clean = data.html.replace(/```json?\n?|\n?```/g, "").trim();
        const values = JSON.parse(clean);
        for (const k of Object.keys(values)) {
          vars[k] = values[k];
          origins[k] = "ai_generated";
        }
        await pool.query("UPDATE sections SET variables = ?, variable_origins = ? WHERE id = ?", [JSON.stringify(vars), JSON.stringify(origins), sec.id]);
        generated++;
      } catch { /* ignore parse errors */ }
    }

    return NextResponse.json({ ok: true, generated });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
