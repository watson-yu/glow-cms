import pool from "@/lib/db";
import { substituteVars } from "@/lib/template";

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
  const [sections] = await pool.query(`
    SELECT s.*, st.name as type_name FROM sections s
    JOIN section_types st ON s.section_type_id = st.id
    WHERE s.page_id = ? ORDER BY s.sort_order
  `, [pages[0].id]);
  const config = await getSiteConfig();
  const page = { ...pages[0], sections };
  page.header_content = substituteVars(page.header_content, config);
  page.footer_content = substituteVars(page.footer_content, config);
  page.sections = page.sections.map(s => {
    const vars = typeof s.variables === "string" ? JSON.parse(s.variables || "{}") : (s.variables || {});
    return { ...s, content: substituteVars(substituteVars(s.content, vars), config) };
  });
  // Assemble sections into page template
  const sectionsHtml = page.sections.map(s => s.content).join("\n");
  const tpl = page.template_content || "{{content}}";
  page.body_content = substituteVars(tpl.replace("{{content}}", sectionsHtml), config);
  return page;
}

export async function getContentPath() {
  const [rows] = await pool.query("SELECT config_value FROM site_config WHERE config_key = 'content_path'");
  const raw = rows[0]?.config_value || "";
  if (!raw || raw === "/") return "";
  return raw.startsWith("/") ? raw : `/${raw}`;
}
