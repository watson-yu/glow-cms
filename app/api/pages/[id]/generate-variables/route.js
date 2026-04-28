import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { substituteVars } from "@/lib/template";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function getKey(key) {
  const [rows] = await pool.query("SELECT config_value FROM system_config WHERE config_key = ?", [key]);
  return rows[0]?.config_value || "";
}

export async function POST(req, { params }) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const { id } = await params;

    const [pages] = await pool.query(
      "SELECT p.title, p.slug, p.category_id, c.name as category_name, c.description as category_description, c.parent_id, pc.name as parent_name, pc.description as parent_description FROM pages p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN categories pc ON c.parent_id = pc.id WHERE p.id = ?",
      [id]
    );
    if (!pages.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const page = pages[0];
    const ctx = { category: page.category_name || "", parent_category: page.parent_name || "", category_description: page.category_description || "", parent_category_description: page.parent_description || "", title: page.title || "", slug: page.slug || "" };

    const apiKey = await getKey("gemini_api_key");
    if (!apiKey) return NextResponse.json({ error: "No Gemini API key configured" }, { status: 400 });

    const [sections] = await pool.query(
      "SELECT s.id, s.variables, s.variable_origins, st.variables as type_variables FROM sections s JOIN section_types st ON s.section_type_id = st.id WHERE s.page_id = ? ORDER BY s.sort_order",
      [id]
    );

    // Count sections that need generation
    const sectionsToGen = sections.filter(sec => {
      const tv = typeof sec.type_variables === "string" ? JSON.parse(sec.type_variables || "[]") : (sec.type_variables || []);
      const origins = typeof sec.variable_origins === "string" ? JSON.parse(sec.variable_origins || "{}") : (sec.variable_origins || {});
      return tv.some(v => (v.type || "prompt") === "prompt" && v.label && origins[v.key] !== "manual");
    });

    // Create job record
    const [jobResult] = await pool.query(
      "INSERT INTO generation_jobs (page_id, status, sections_total) VALUES (?, 'running', ?)",
      [id, sectionsToGen.length]
    );
    const jobId = jobResult.insertId;

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
    let done = 0;
    let lastError = null;

    for (const sec of sections) {
      const typeVars = (() => { try { return typeof sec.type_variables === "string" ? JSON.parse(sec.type_variables || "[]") : (sec.type_variables || []); } catch { return []; } })();
      const vars = (() => { try { return typeof sec.variables === "string" ? JSON.parse(sec.variables || "{}") : (sec.variables || {}); } catch { return {}; } })();
      const origins = (() => { try { return typeof sec.variable_origins === "string" ? JSON.parse(sec.variable_origins || "{}") : (sec.variable_origins || {}); } catch { return {}; } })();

      const toGenerate = typeVars.filter(v => (v.type || "prompt") === "prompt" && v.label && origins[v.key] !== "manual");
      if (!toGenerate.length) continue;

      const prompt = toGenerate.map(v => `- ${v.key}: ${substituteVars(v.label, ctx)}`).join("\n");
      try {
        const res = await model.generateContent(`Generate short text values for the following variables. Return ONLY a JSON object with the keys and generated string values, no markdown fences.\n\n${prompt}`);
        const raw = res.response.text().replace(/```json?\n?|\n?```/g, "").trim();
        const values = JSON.parse(raw);
        for (const k of Object.keys(values)) {
          vars[k] = values[k];
          origins[k] = "ai_generated";
        }
        await pool.query("UPDATE sections SET variables = ?, variable_origins = ? WHERE id = ?", [JSON.stringify(vars), JSON.stringify(origins), sec.id]);
        done++;
        await pool.query("UPDATE generation_jobs SET sections_done = ? WHERE id = ?", [done, jobId]);
      } catch (e) {
        lastError = e.message || "Generation failed";
      }
    }

    // Finalize job
    const finalStatus = done === sectionsToGen.length ? "completed" : (done > 0 ? "completed" : "failed");
    await pool.query(
      "UPDATE generation_jobs SET status = ?, sections_done = ?, error = ?, completed_at = NOW() WHERE id = ?",
      [finalStatus, done, lastError, jobId]
    );

    return NextResponse.json({ ok: true, jobId, generated: done });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
