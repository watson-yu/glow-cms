import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { substituteVars } from "@/lib/template";
import { requireAuth } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { planSectionTokens, buildGenPrompt, sourceOf } from "@/lib/section-vars";

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
              p.title, p.slug, p.category_id,
              c.name as category_name, c.description as category_description,
              pc.name as parent_name, pc.description as parent_description
       FROM sections s
       JOIN pages p ON s.page_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN categories pc ON c.parent_id = pc.id
       WHERE s.section_type_id = ?`,
      [id]
    );
    if (!sections.length) return NextResponse.json({ updated: 0 });

    const [siteRows] = await pool.query("SELECT config_key, config_value FROM site_config");
    const siteConfig = Object.fromEntries(siteRows.map(r => [r.config_key, r.config_value]));
    const siteTitle = siteConfig.site_title || "";
    const siteKeys = new Set(Object.keys(siteConfig));
    const defaultContent = types[0].default_content;
    const ctxFor = (s) => ({ category: s.category_name || "", parent_category: s.parent_name || "", category_description: s.category_description || "", parent_category_description: s.parent_description || "", title: s.title || "", slug: s.slug || "", site_title: siteTitle });

    if (action === "template_only") {
      return NextResponse.json({ updated: 0, action });
    }

    if (action === "fill_fixed") {
      let updated = 0;
      for (const s of sections) {
        const vars = (() => { try { return JSON.parse(s.variables || "{}"); } catch { return {}; } })();
        const origins = (() => { try { return JSON.parse(s.variable_origins || "{}"); } catch { return {}; } })();
        const ctx = ctxFor(s);
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
        const ctx = ctxFor(s);
        let changed = false;
        for (const v of typeVars) {
          if (v.type !== "fixed" || !v.label) continue;
          if (sourceOf(origins, vars, v.key) === "manual") continue;
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

    // generate_missing / refresh_ai — need LLM. Auto-discovers every {{token}} in the
    // template (declared or not) and resolves context tokens like {{category}}.
    const shouldGenerate = action === "generate_missing"
      ? (k, src) => src === "empty"      // only fill blanks
      : (k, src) => src !== "manual";    // refresh_ai: empty + prior AI values
    let updated = 0;
    let failed = 0;
    for (const s of sections) {
      const vars = (() => { try { return JSON.parse(s.variables || "{}"); } catch { return {}; } })();
      const origins = (() => { try { return JSON.parse(s.variable_origins || "{}"); } catch { return {}; } })();
      const ctx = ctxFor(s);
      const { contextUpdates, contentToGenerate } = planSectionTokens({ defaultContent, typeVars, vars, origins, ctx, siteKeys, shouldGenerate });
      let changed = false;

      for (const [k, val] of Object.entries(contextUpdates)) {
        if (vars[k] !== val) { vars[k] = val; origins[k] = { source: "ai_generated", generated_at: new Date().toISOString() }; changed = true; }
      }

      if (contentToGenerate.length) {
        try {
          const result = await callLLM({ prompt: buildGenPrompt(ctx, contentToGenerate), objectType: "variable_generation", objectKey: `section_type:${id}` });
          const clean = result.text.replace(/```json?\n?|\n?```/g, "").trim();
          const values = JSON.parse(clean);
          const wanted = new Set(contentToGenerate.map(v => v.key));
          for (const [k, val] of Object.entries(values)) {
            if (!wanted.has(k)) continue;
            vars[k] = val;
            origins[k] = { source: "ai_generated", generated_at: new Date().toISOString() };
            changed = true;
          }
        } catch (e) {
          console.error(`Propagation failed for section ${s.id}:`, e);
          failed++;
        }
      }

      if (changed) {
        await pool.query("UPDATE sections SET variables = ?, variable_origins = ? WHERE id = ?",
          [JSON.stringify(vars), JSON.stringify(origins), s.id]);
        updated++;
      }
    }
    return NextResponse.json({ updated, failed, action });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
