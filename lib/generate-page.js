import pool from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { planSectionTokens, buildGenPrompt, parseJsonLoose } from "@/lib/section-vars";

/**
 * Generate variables for a single page. Auto-discovers every {{token}} in each
 * section's template and fills it from the page's category — no manual variable
 * declarations required. Creates a generation_jobs record.
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

  const [siteRows] = await pool.query("SELECT config_key, config_value FROM site_config");
  const siteConfig = Object.fromEntries(siteRows.map(r => [r.config_key, r.config_value]));
  ctx.site_title = siteConfig.site_title || "";
  const siteKeys = new Set(Object.keys(siteConfig)); // substituted at render time, not generated

  const [sections] = await pool.query(
    "SELECT s.id, s.section_type_id, s.variables, s.variable_origins, st.variables as type_variables, st.default_content FROM sections s JOIN section_types st ON s.section_type_id = st.id WHERE s.page_id = ? ORDER BY s.sort_order",
    [pageId]
  );

  const parse = (val, fallback) => { try { return typeof val === "string" ? JSON.parse(val || (Array.isArray(fallback) ? "[]" : "{}")) : (val || fallback); } catch { return fallback; } };

  // Generate everything that isn't a manual edit (fills empty, refreshes prior AI values).
  const shouldGenerate = (key, src) => src !== "manual";

  const plans = sections.map(sec => {
    const vars = parse(sec.variables, {});
    const origins = parse(sec.variable_origins, {});
    const { contextUpdates, contentToGenerate } = planSectionTokens({
      defaultContent: sec.default_content,
      typeVars: parse(sec.type_variables, []),
      vars, origins, ctx, siteKeys, shouldGenerate,
    });
    return { sec, vars, origins, contextUpdates, contentToGenerate };
  });

  const sectionsToGen = plans.filter(p => p.contentToGenerate.length);

  const [jobResult] = await pool.query(
    "INSERT INTO generation_jobs (page_id, status, sections_total) VALUES (?, 'running', ?)",
    [pageId, sectionsToGen.length]
  );
  const jobId = jobResult.insertId;

  let done = 0, lastError = null;
  const stamp = () => ({ source: "ai_generated", job_id: jobId, generated_at: new Date().toISOString() });

  for (const { sec, vars, origins, contextUpdates, contentToGenerate } of plans) {
    let changed = false;

    // 1. Resolve context tokens (category, etc.) directly — no LLM call.
    for (const [k, val] of Object.entries(contextUpdates)) {
      if (vars[k] !== val) { vars[k] = val; origins[k] = stamp(); changed = true; }
    }

    // 2. Ask the LLM to write everything else, tailored to this page's category.
    if (contentToGenerate.length) {
      try {
        const result = await callLLM({ prompt: buildGenPrompt(ctx, contentToGenerate), objectType: "variable_generation", objectKey: `section_type:${sec.section_type_id}` });
        const values = parseJsonLoose(result.text);
        if (!values) throw new Error("LLM did not return JSON");
        const wanted = new Set(contentToGenerate.map(v => v.key));
        for (const k of Object.keys(values)) {
          if (!wanted.has(k)) continue;          // ignore anything we didn't ask for
          vars[k] = values[k];
          origins[k] = stamp();
          changed = true;
        }
        done++;
        await pool.query("UPDATE generation_jobs SET sections_done = ? WHERE id = ?", [done, jobId]);
      } catch (e) { lastError = e.message || "Generation failed"; }
    }

    if (changed) {
      await pool.query("UPDATE sections SET variables = ?, variable_origins = ? WHERE id = ?", [JSON.stringify(vars), JSON.stringify(origins), sec.id]);
    }
  }

  const finalStatus = done === sectionsToGen.length ? "completed" : "failed";
  await pool.query("UPDATE generation_jobs SET status = ?, sections_done = ?, error = ?, completed_at = NOW() WHERE id = ?", [finalStatus, done, lastError, jobId]);
  await pool.query("UPDATE pages SET status = ? WHERE id = ? AND status = 'generating'", [finalStatus === "completed" ? "ready_for_review" : "generation_failed", pageId]);

  return { jobId, generated: done };
}
