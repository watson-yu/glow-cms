import pool from "@/lib/db";
import { substituteVars } from "@/lib/template";
import { callLLM } from "@/lib/llm";

/**
 * Generate prompt variables for a single page. Creates a generation_jobs record.
 * @param {number} pageId
 * @returns {{ jobId: number, generated: number }}
 */
export async function generatePageVariables(pageId) {
  const [pages] = await pool.query(
    "SELECT p.title, p.slug, p.category_id, c.name as category_name, c.description as category_description, c.parent_id, pc.name as parent_name, pc.description as parent_description FROM pages p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN categories pc ON c.parent_id = pc.id WHERE p.id = ?",
    [pageId]
  );
  if (!pages.length) throw new Error("Page not found");
  const page = pages[0];
  const ctx = { category: page.category_name || "", parent_category: page.parent_name || "", category_description: page.category_description || "", parent_category_description: page.parent_description || "", title: page.title || "", slug: page.slug || "" };

  const [siteRows] = await pool.query("SELECT config_value FROM site_config WHERE config_key = 'site_title'");
  ctx.site_title = siteRows[0]?.config_value || "";

  const [sections] = await pool.query(
    "SELECT s.id, s.variables, s.variable_origins, st.variables as type_variables FROM sections s JOIN section_types st ON s.section_type_id = st.id WHERE s.page_id = ? ORDER BY s.sort_order",
    [pageId]
  );

  const parse = (val, fallback) => { try { return typeof val === "string" ? JSON.parse(val || (Array.isArray(fallback) ? "[]" : "{}")) : (val || fallback); } catch { return fallback; } };
  const getSource = (o) => typeof o === "object" ? o?.source : o;

  const sectionsToGen = sections.filter(sec => {
    const tv = parse(sec.type_variables, []);
    const origins = parse(sec.variable_origins, {});
    return tv.some(v => (v.type || "prompt") === "prompt" && v.label && getSource(origins[v.key]) !== "manual");
  });

  const [jobResult] = await pool.query(
    "INSERT INTO generation_jobs (page_id, status, sections_total) VALUES (?, 'running', ?)",
    [pageId, sectionsToGen.length]
  );
  const jobId = jobResult.insertId;

  let done = 0, lastError = null;

  for (const sec of sections) {
    const typeVars = parse(sec.type_variables, []);
    const vars = parse(sec.variables, {});
    const origins = parse(sec.variable_origins, {});

    const toGenerate = typeVars.filter(v => (v.type || "prompt") === "prompt" && v.label && getSource(origins[v.key]) !== "manual");
    if (!toGenerate.length) continue;

    const prompt = `Generate short text values for the following variables. Return ONLY a JSON object with the keys and generated string values, no markdown fences.\n\n${toGenerate.map(v => `- ${v.key}: ${substituteVars(v.label, ctx)}`).join("\n")}`;
    try {
      const result = await callLLM({ provider: "gemini", prompt });
      const clean = result.text.replace(/```json?\n?|\n?```/g, "").trim();
      const values = JSON.parse(clean);
      for (const k of Object.keys(values)) {
        vars[k] = values[k];
        origins[k] = { source: "ai_generated", job_id: jobId, generated_at: new Date().toISOString() };
      }
      await pool.query("UPDATE sections SET variables = ?, variable_origins = ? WHERE id = ?", [JSON.stringify(vars), JSON.stringify(origins), sec.id]);
      done++;
      await pool.query("UPDATE generation_jobs SET sections_done = ? WHERE id = ?", [done, jobId]);
    } catch (e) { lastError = e.message || "Generation failed"; }
  }

  const finalStatus = done === sectionsToGen.length ? "completed" : (done > 0 ? "completed" : "failed");
  await pool.query("UPDATE generation_jobs SET status = ?, sections_done = ?, error = ?, completed_at = NOW() WHERE id = ?", [finalStatus, done, lastError, jobId]);
  await pool.query("UPDATE pages SET status = ? WHERE id = ? AND status = 'generating'", [finalStatus === "completed" ? "ready_for_review" : "generation_failed", pageId]);

  return { jobId, generated: done };
}
