import pool from "@/lib/db";
import { substituteVars } from "@/lib/template";
import { sanitizeHtml } from "@/lib/sanitize";
import { safeJsonParse } from "@/lib/validate";

let _siteConfigCache = null;
let _siteConfigExpiry = 0;
const SITE_CONFIG_TTL = 10_000; // 10 seconds

export async function getSiteConfig() {
  const now = Date.now();
  if (_siteConfigCache && now < _siteConfigExpiry) return _siteConfigCache;
  const [rows] = await pool.query("SELECT config_key, config_value FROM site_config");
  _siteConfigCache = Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
  _siteConfigExpiry = now + SITE_CONFIG_TTL;
  return _siteConfigCache;
}

export async function getPageBySlug(slug, publishedOnly = true) {
  const where = publishedOnly ? "AND p.status = 'published'" : "";
  const [pages] = await pool.query(`
    SELECT p.*, h.content as header_content, f.content as footer_content, pt.content as template_content
    FROM pages p
    LEFT JOIN headers h ON p.header_id = h.id
    LEFT JOIN footers f ON p.footer_id = f.id
    LEFT JOIN page_templates pt ON p.page_template_id = pt.id
    WHERE p.slug = ? ${where}
  `, [slug]);
  if (!pages.length) return null;

  // Use rendered snapshot for published pages if available
  if (publishedOnly && pages[0].rendered_html) {
    return { ...pages[0], body_content: pages[0].rendered_html, header_content: "", footer_content: "", sections: [] };
  }

  return assemblePageHtml(pages[0]);
}

async function assemblePageHtml(page) {
  const [sections] = await pool.query(`
    SELECT s.*, st.name as type_name, st.default_content as type_content, st.variables as type_variables FROM sections s
    JOIN section_types st ON s.section_type_id = st.id
    WHERE s.page_id = ? ORDER BY s.sort_order
  `, [page.id]);
  const config = await getSiteConfig();
  page = { ...page, sections };
  const strip = { stripUnresolved: true };
  page.header_content = substituteVars(page.header_content, config, strip);
  page.footer_content = substituteVars(page.footer_content, config, strip);
  page.sections = page.sections.map(s => {
    const typeVars = safeJsonParse(s.type_variables, []);
    const pageVars = safeJsonParse(s.variables, {});
    const defaults = {};
    const ctx = { ...config, title: page.title, slug: page.slug };
    for (const v of typeVars) {
      if (v.type === "fixed" && v.label) defaults[v.key] = substituteVars(v.label, ctx);
    }
    const vars = { ...defaults, ...pageVars };
    const template = s.type_content || s.content;
    return { ...s, content: substituteVars(substituteVars(template, vars), config, strip) };
  });
  const sectionsHtml = page.sections.map(s => s.content).join("\n");
  const tpl = page.template_content || "{{content}}";
  page.body_content = substituteVars(tpl.replace("{{content}}", sectionsHtml), config, strip);
  page.header_content = sanitizeHtml(page.header_content);
  page.body_content = sanitizeHtml(page.body_content);
  page.footer_content = sanitizeHtml(page.footer_content);
  return page;
}

/**
 * Render and store HTML snapshot for a page. Call on publish.
 */
export async function renderPageSnapshot(pageId) {
  const [pages] = await pool.query(`
    SELECT p.*, h.content as header_content, f.content as footer_content, pt.content as template_content
    FROM pages p
    LEFT JOIN headers h ON p.header_id = h.id
    LEFT JOIN footers f ON p.footer_id = f.id
    LEFT JOIN page_templates pt ON p.page_template_id = pt.id
    WHERE p.id = ?
  `, [pageId]);
  if (!pages.length) return;
  const assembled = await assemblePageHtml(pages[0]);
  const fullHtml = [assembled.header_content, assembled.body_content, assembled.footer_content].filter(Boolean).join("\n");
  await pool.query("UPDATE pages SET rendered_html = ? WHERE id = ?", [fullHtml, pageId]);
}

/**
 * Clear rendered_html for all published pages. Call when shared components change.
 */
export async function clearAllSnapshots() {
  await pool.query("UPDATE pages SET rendered_html = NULL WHERE rendered_html IS NOT NULL");
}

export async function getContentPath() {
  const [rows] = await pool.query("SELECT config_value FROM site_config WHERE config_key = 'content_path'");
  const raw = rows[0]?.config_value || "";
  if (!raw || raw === "/") return "";
  return raw.startsWith("/") ? raw : `/${raw}`;
}
