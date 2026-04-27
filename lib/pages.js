import pool from "@/lib/db";
import { substituteVars } from "@/lib/template";
import { sanitizeHtml } from "@/lib/sanitize";

export async function getSiteConfig() {
  const [rows] = await pool.query("SELECT config_key, config_value FROM site_config");
  return Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
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
  const [sections] = await pool.query(`
    SELECT s.*, st.name as type_name, st.default_content as type_content, st.variables as type_variables FROM sections s
    JOIN section_types st ON s.section_type_id = st.id
    WHERE s.page_id = ? ORDER BY s.sort_order
  `, [pages[0].id]);
  const config = await getSiteConfig();
  const page = { ...pages[0], sections };
  const strip = { stripUnresolved: true };
  page.header_content = substituteVars(page.header_content, config, strip);
  page.footer_content = substituteVars(page.footer_content, config, strip);
  page.sections = page.sections.map(s => {
    const typeVars = typeof s.type_variables === "string" ? JSON.parse(s.type_variables || "[]") : (s.type_variables || []);
    const pageVars = typeof s.variables === "string" ? JSON.parse(s.variables || "{}") : (s.variables || {});
    // Build defaults from fixed variable labels
    const defaults = {};
    const ctx = { ...config, title: pages[0].title, slug: pages[0].slug };
    for (const v of typeVars) {
      if (v.type === "fixed" && v.label) defaults[v.key] = substituteVars(v.label, ctx);
    }
    const vars = { ...defaults, ...pageVars };
    const template = s.type_content || s.content;
    return { ...s, content: substituteVars(substituteVars(template, vars), config, strip) };
  });
  // Assemble sections into page template
  const sectionsHtml = page.sections.map(s => s.content).join("\n");
  const tpl = page.template_content || "{{content}}";
  page.body_content = substituteVars(tpl.replace("{{content}}", sectionsHtml), config, strip);
  page.header_content = sanitizeHtml(page.header_content);
  page.body_content = sanitizeHtml(page.body_content);
  page.footer_content = sanitizeHtml(page.footer_content);
  return page;
}

export async function getContentPath() {
  const [rows] = await pool.query("SELECT config_value FROM site_config WHERE config_key = 'content_path'");
  const raw = rows[0]?.config_value || "";
  if (!raw || raw === "/") return "";
  return raw.startsWith("/") ? raw : `/${raw}`;
}
