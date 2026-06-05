import { substituteVars } from "@/lib/template";

// Tokens resolved directly from the page's category/site context (never LLM-generated).
export const CTX_KEYS = ["category", "parent_category", "category_description", "parent_category_description", "title", "slug", "site_title"];
// Tokens that look like assets/links — the LLM can't produce real URLs, so leave them
// to author-set fixed variables rather than fabricating values.
export const ASSET_RE = /(url|image|img|src|href|link|icon|logo|photo|avatar)/i;
// Tokens that look like CSS/style values — these are design config, not content, and
// must be author-set (fixed) or literal in the template, never LLM-written as prose.
export const STYLE_RE = /(color|colour|bg|background|padding|margin|opacity|width|height|size|radius|gap|align|font|weight|spacing|border|shadow|offset|zindex|z_index|duration|delay)/i;

// All distinct {{token}} names in a template.
export function extractTokens(html) {
  const set = new Set();
  for (const m of (html || "").matchAll(/\{\{(\w+)\}\}/g)) set.add(m[1]);
  return [...set];
}

// "solution_item_1_title" -> "solution item 1 title" (a hint for undeclared tokens).
export function humanize(key) {
  return key.replace(/_/g, " ").trim();
}

// Normalise an origin entry to a source string. A value with no origin is treated as
// manual (legacy rows) so we never clobber hand-authored content.
export function sourceOf(origins, vars, key) {
  const o = origins[key];
  if (o) return typeof o === "object" ? o.source : o;
  return vars[key] ? "manual" : "empty";
}

/**
 * Decide, for one section, which template tokens to resolve from context vs. ask the LLM
 * to write — auto-discovering every {{token}}, declared or not.
 * @returns {{ contextUpdates: Record<string,string>, contentToGenerate: {key:string,hint:string}[] }}
 */
export function planSectionTokens({ defaultContent, typeVars, vars, origins, ctx, siteKeys, shouldGenerate }) {
  const declared = Object.fromEntries((typeVars || []).map(v => [v.key, v]));
  const contextUpdates = {};
  const contentToGenerate = [];

  for (const key of extractTokens(defaultContent)) {
    const src = sourceOf(origins, vars, key);
    if (CTX_KEYS.includes(key)) {                              // {{category}} etc. -> from context
      if (src !== "manual" && ctx[key]) contextUpdates[key] = ctx[key];
      continue;
    }
    if (siteKeys && siteKeys.has(key)) continue;               // {{site_title}} etc. -> render handles it
    const dv = declared[key];
    if (dv && dv.type === "fixed") continue;                   // author-set fixed value (handled elsewhere)
    if (ASSET_RE.test(key)) continue;                          // don't fabricate image/link URLs
    if (STYLE_RE.test(key)) continue;                          // don't write prose into CSS/style tokens
    if (!shouldGenerate(key, src)) continue;
    const hint = dv && (dv.type || "prompt") === "prompt" && dv.label
      ? substituteVars(dv.label, ctx)                          // declared prompt var keeps its custom instruction
      : humanize(key);                                         // undeclared token -> infer from its name
    contentToGenerate.push({ key, hint });
  }
  return { contextUpdates, contentToGenerate };
}

// Parse a JSON object from an LLM response that may include code fences or surrounding
// prose. Returns the parsed object, or null if no JSON object can be recovered.
export function parseJsonLoose(text) {
  if (!text) return null;
  const stripped = text.replace(/```json?\s*|\s*```/g, "").trim();
  try { return JSON.parse(stripped); } catch { /* fall through */ }
  const start = stripped.indexOf("{"), end = stripped.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(stripped.slice(start, end + 1)); } catch { /* give up */ }
  }
  return null;
}

// Build the JSON-only variable-generation prompt for a set of tokens, tailored to the category.
export function buildGenPrompt(ctx, contentToGenerate) {
  const contextLine = ctx.category
    ? `Context: this content is for a "${ctx.category}" page${ctx.parent_category ? ` under "${ctx.parent_category}"` : ""}. The category name "${ctx.category}" is inserted automatically by the template wherever {{category}} appears, so do NOT write the category name into these values (e.g. a headline prefix/suffix must read naturally around it without repeating it).`
    : "Context: this content is for a service/category page.";
  return `IMPORTANT: This is a variable generation task, NOT an HTML generation task. Follow any CONTENT or topic guidance from the system prompt (what each variable should say), but IGNORE layout, HTML, CSS and styling instructions. Return ONLY a raw JSON object with string values, no HTML, no markdown fences, no explanation.\n\n${contextLine}\n\nGenerate concise, ready-to-publish text values for these variables. Use the variable name as a guide to what each should contain:\n${contentToGenerate.map(v => `- ${v.key}: ${v.hint}`).join("\n")}`;
}
