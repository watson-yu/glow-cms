import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { substituteVars } from "@/lib/template";
import { requireAuth } from "@/lib/auth";

async function getPromptStack(sectionTypeId) {
  const [rows] = await pool.query(
    "SELECT scope_key, content FROM prompts WHERE scope_key IN ('system', 'section_type', ?) AND is_active = 1",
    [`section_type:${sectionTypeId}`]
  );
  const map = Object.fromEntries(rows.map(r => [r.scope_key, r.content]));
  return [map["system"], map["section_type"], map[`section_type:${sectionTypeId}`]].filter(Boolean).join("\n\n");
}

// Missing origin on an existing value = legacy row, treat as manual (safest assumption)
function originOf(origins, vars, key) {
  if (origins[key]) return origins[key];
  return vars[key] ? "manual" : "empty";
}

export async function POST(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const { id } = await params;
    const { action } = await req.json();
    const valid = ["template_only", "fill_fixed", "refresh_fixed", "generate_missing", "refresh_ai"];
    if (!valid.includes(action)) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    const [types] = await pool.query("SELECT * FROM section_types WHERE id = ?", [id]);
    if (!types.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const typeVars = JSON.parse(types[0].variables || "[]");

    const [sections] = await pool.query(
      `SELECT s.id, s.page_id, s.variables, s.variable_origins,
              p.title, p.slug, p.category_id, c.name as category_name
       FROM sections s
       JOIN pages p ON s.page_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE s.section_type_id = ?`,
      [id]
    );
    if (!sections.length) return NextResponse.json({ updated: 0 });

    if (action === "template_only") {
      return NextResponse.json({ updated: 0, action });
    }

    if (action === "fill_fixed") {
      let updated = 0;
      for (const s of sections) {
        const vars = JSON.parse(s.variables || "{}");
        const origins = JSON.parse(s.variable_origins || "{}");
        const ctx = { category: s.category_name || "", slug: s.slug, title: s.title };
        let changed = false;
        for (const v of typeVars) {
          if (v.type !== "fixed" || !v.label) continue;
          if (vars[v.key]) continue; // value already exists, regardless of origin
          const val = substituteVars(v.label, ctx);
          vars[v.key] = val;
          origins[v.key] = "ai_generated";
          changed = true;
        }
        if (changed) {
          await pool.query("UPDATE sections SET variables = ?, variable_origins = ? WHERE id = ?",
            [JSON.stringify(vars), JSON.stringify(origins), s.id]);
          updated++;
        }
      }
      return NextResponse.json({ updated, action });
    }

    if (action === "refresh_fixed") {
      let updated = 0;
      for (const s of sections) {
        const vars = JSON.parse(s.variables || "{}");
        const origins = JSON.parse(s.variable_origins || "{}");
        const ctx = { category: s.category_name || "", slug: s.slug, title: s.title };
        let changed = false;
        for (const v of typeVars) {
          if (v.type !== "fixed" || !v.label) continue;
          if (originOf(origins, vars, v.key) === "manual") continue;
          const val = substituteVars(v.label, ctx);
          if (vars[v.key] !== val) {
            vars[v.key] = val;
            origins[v.key] = "ai_generated";
            changed = true;
          }
        }
        if (changed) {
          await pool.query("UPDATE sections SET variables = ?, variable_origins = ? WHERE id = ?",
            [JSON.stringify(vars), JSON.stringify(origins), s.id]);
          updated++;
        }
      }
      return NextResponse.json({ updated, action });
    }

    // generate_missing / refresh_ai — need LLM
    const [sysRows] = await pool.query("SELECT config_value FROM system_config WHERE config_key = 'gemini_api_key'");
    const apiKey = sysRows[0]?.config_value;
    if (!apiKey) return NextResponse.json({ error: "No Gemini API key configured" }, { status: 400 });

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genModel = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemPrompt = await getPromptStack(id);

    let updated = 0;
    for (const s of sections) {
      const vars = JSON.parse(s.variables || "{}");
      const origins = JSON.parse(s.variable_origins || "{}");
      const ctx = { category: s.category_name || "", slug: s.slug, title: s.title };

      const toGenerate = typeVars.filter(v => {
        if ((v.type || "prompt") !== "prompt" || !v.label) return false;
        const o = originOf(origins, vars, v.key);
        if (o === "manual") return false;
        if (action === "generate_missing") return o === "empty";
        return true; // refresh_ai: empty + ai_generated
      });
      if (!toGenerate.length) continue;

      const prompt = toGenerate.map(v => `- ${v.key}: ${substituteVars(v.label, ctx)}`).join("\n");
      try {
        const res = await genModel.generateContent([{
          text: `${systemPrompt}\n\nGenerate short text values for the following variables. Return ONLY a JSON object with the keys and generated string values, no markdown fences.\n\n${prompt}`
        }]);
        const clean = res.response.text().replace(/```json?\n?|\n?```/g, "").trim();
        const values = JSON.parse(clean);
        for (const [k, val] of Object.entries(values)) {
          vars[k] = val;
          origins[k] = "ai_generated";
        }
        await pool.query("UPDATE sections SET variables = ?, variable_origins = ? WHERE id = ?",
          [JSON.stringify(vars), JSON.stringify(origins), s.id]);
        updated++;
      } catch (e) { /* skip failed generations */ }
    }
    return NextResponse.json({ updated, action });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
