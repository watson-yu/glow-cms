// Pure logic for the in-app bulk AI content generator (admin → Pages list).
//
// The actual network calls (POST /api/generate, PUT /api/pages/[id]) live in the
// client component so they can stream live progress without an HTTP timeout. The
// pieces that are easy to get wrong — "regenerate must REPLACE, not duplicate" and
// "one failed page must not abort the batch" — are isolated here so they can be
// unit-tested without a DOM or a database.

// Build the LLM prompt for one page from its title and any category context.
// `extra` is optional free-text the admin can add in the batch dialog (applied to
// every page in the run).
export function buildBulkPrompt(page, { categoryName, categoryDescription, extra } = {}) {
  const lines = [
    `Generate complete, production-ready landing-page body content for the page titled "${page.title}".`,
  ];
  if (categoryName) lines.push(`Category: ${categoryName}.`);
  if (categoryDescription) lines.push(`Context: ${categoryDescription}`);
  if (extra && extra.trim()) lines.push(extra.trim());
  lines.push(
    "Return only the inner HTML for the page body (no <html>/<head>/<body> wrappers, no markdown code fences, no {{placeholders}})."
  );
  return lines.join("\n");
}

// Merge freshly generated HTML into a page's existing sections as the single
// "generated content" section, identified by `sectionTypeId`.
//
// Idempotency contract: if the page already has a section of that type (i.e. this
// page was generated before, or the type was seeded by the page template), REPLACE
// its content in place. Otherwise append a new section. This is what makes a
// re-run a regenerate instead of stacking duplicate sections.
//
// Returns a fresh sections array shaped for PUT /api/pages/[id] — each entry keeps
// only { section_type_id, content, variables }, dropping join columns like
// type_name so they don't get round-tripped back into the DB.
export function mergeGeneratedSection(existingSections, sectionTypeId, html) {
  const typeId = Number(sectionTypeId);
  const sections = (existingSections || []).map((s) => ({
    section_type_id: Number(s.section_type_id),
    content: s.content,
    variables: normalizeVariables(s.variables),
  }));
  const idx = sections.findIndex((s) => s.section_type_id === typeId);
  if (idx >= 0) {
    sections[idx] = { ...sections[idx], content: html };
  } else {
    sections.push({ section_type_id: typeId, content: html, variables: {} });
  }
  return sections;
}

function normalizeVariables(variables) {
  if (!variables) return {};
  if (typeof variables === "string") {
    try {
      return JSON.parse(variables) || {};
    } catch {
      return {};
    }
  }
  return variables;
}

// Run a batch over `pages` serially, one page at a time, so each generate call is
// modest and the publish step is never concurrent (the publish deadlock fix is
// server-side, but we keep the client well-behaved). A page that throws is
// recorded as a failure and the batch continues — it never aborts the run.
//
//   processPage(page, index) -> Promise   // does generate + save for one page; throws on failure
//   onProgress({ index, total, page, status, result }) -> void
//     status: "running" before, then "ok" | "failed" after.
//
// Returns an array of { id, title, ok, error? } in input order. Re-running with
// only the failed pages (see failedPages) is how "retry failures" works.
export async function runBulkGeneration(pages, { processPage, onProgress } = {}) {
  const results = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onProgress?.({ index: i, total: pages.length, page, status: "running" });
    let result;
    try {
      await processPage(page, i);
      result = { id: page.id, title: page.title, ok: true };
    } catch (e) {
      result = { id: page.id, title: page.title, ok: false, error: e?.message || String(e) };
    }
    results.push(result);
    onProgress?.({ index: i, total: pages.length, page, status: result.ok ? "ok" : "failed", result });
  }
  return results;
}

// Given a results array from runBulkGeneration and the pages that produced it,
// return the subset of pages whose generation failed — the input for a retry run.
export function failedPages(pages, results) {
  const failedIds = new Set(results.filter((r) => !r.ok).map((r) => r.id));
  return pages.filter((p) => failedIds.has(p.id));
}
