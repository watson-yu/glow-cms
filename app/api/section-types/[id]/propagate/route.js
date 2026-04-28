import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { substituteVars } from "@/lib/template";
import { requireAuth } from "@/lib/auth";
import { callLLM } from "@/lib/llm";

// Missing origin on an existing value = legacy row, treat as manual (safest assumption)
function originOf(origins, vars, key) {
  const o = origins[key];
  if (o) return typeof o === "object" ? o.source : o;
  return vars[key] ? "manual" : "empty";
}

export async function POST(req, { params }) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {

    const { id } = await params;
    const { action } = await req.json();
    const valid = ["template_only", "fill_fixed", "refresh_fixed", "generate_missing", "refresh_ai"];
    if (!valid.includes(action)) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    const [types] = await pool.query("SELECT * FROM section_types WHERE id = ?", [id]);
    if (!types.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const typeVars = (() => { try { return JSON.parse(types[0].variables || "[]"); } catch { return []; } })();

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

    const [stRows] = await pool.query("SELECT config_value FROM site_config WHERE config_key = 'site_title'");
    const siteTitle = stRows[0]?.config_value || "";

    if (action === "template_only") {
      return NextResponse.json({ updated: 0, action });
    }

    if (action === "fill_fixed") {
      let updated = 0;
      for (const s of sections) {
        const vars = (() => { try { return JSON.parse(s.variables || "{}"); } catch { return {}; } })();
        const origins = (() => { try { return JSON.parse(s.variable_origins || "{}"); } catch { return {}; } })();
        const ctx = { category: s.category_name || "", slug: s.slug, title: s.title, site_title: siteTitle };
        let changed = false;
        for (const v of typeVars) {
          if (v.type !== "fixed" || !v.label) continue;
          if (vars[v.key]) continue; // value already exists, regardless of origin
          const val = substituteVars(v.label, ctx);
          vars[v.key] = val;
          origins[v.key] = { source: "ai_generated", generated_at: new Date().toISOString() };
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
        const vars = (() => { try { return JSON.parse(s.variables || "{}"); } catch { return {}; } })();
        const origins = (() => { try { return JSON.parse(s.variable_origins || "{}"); } catch { return {}; } })();
        const ctx = { category: s.category_name || "", slug: s.slug, title: s.title, site_title: siteTitle };
        let changed = false;
        for (const v of typeVars) {
          if (v.type !== "fixed" || !v.label) continue;
          if (originOf(origins, vars, v.key) === "manual") continue;
          const val = substituteVars(v.label, ctx);
          if (vars[v.key] !== val) {
            vars[v.key] = val;
            origins[v.key] = { source: "ai_generated", generated_at: new Date().toISOString() };
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
    let updated = 0;
    let failed = 0;
    for (const s of sections) {
      const vars = (() => { try { return JSON.parse(s.variables || "{}"); } catch { return {}; } })();
      const origins = (() => { try { return JSON.parse(s.variable_origins || "{}"); } catch { return {}; } })();
      const ctx = { category: s.category_name || "", slug: s.slug, title: s.title, site_title: siteTitle };

      const toGenerate = typeVars.filter(v => {
        if ((v.type || "prompt") !== "prompt" || !v.label) return false;
        const o = originOf(origins, vars, v.key);
        if (o === "manual") return false;
        if (action === "generate_missing") return o === "empty";
        return true; // refresh_ai: empty + ai_generated
      });
      if (!toGenerate.length) continue;

      const prompt = `Generate short text values for the following variables. Return ONLY a JSON object with the keys and generated string values, no markdown fences.\n\n${toGenerate.map(v => `- ${v.key}: ${substituteVars(v.label, ctx)}`).join("\n")}`;
      try {
        const result = await callLLM({ provider: "gemini", prompt, skipPromptChain: true, objectType: "variable_generation", objectKey: `section_type:${id}` });
        const clean = result.text.replace(/```json?\n?|\n?```/g, "").trim();
        const values = JSON.parse(clean);
        for (const [k, val] of Object.entries(values)) {
          vars[k] = val;
          origins[k] = { source: "ai_generated", generated_at: new Date().toISOString() };
        }
        await pool.query("UPDATE sections SET variables = ?, variable_origins = ? WHERE id = ?",
          [JSON.stringify(vars), JSON.stringify(origins), s.id]);
        updated++;
      } catch (e) {
        console.error(`Propagation failed for section ${s.id}:`, e);
        failed++;
      }
    }
    return NextResponse.json({ updated, failed, action });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
