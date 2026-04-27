import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [rows] = await pool.query(`
    SELECT p.*, h.name as header_name, f.name as footer_name, pt.name as template_name
    FROM pages p
    LEFT JOIN headers h ON p.header_id = h.id
    LEFT JOIN footers f ON p.footer_id = f.id
    LEFT JOIN page_templates pt ON p.page_template_id = pt.id
    ORDER BY p.created_at DESC
  `);
  return NextResponse.json(rows);
}

export async function POST(req) {
  const { title, slug, header_id, footer_id, page_template_id, status, sections, category_id } = await req.json();

  // Blueprint expansion: inherit header/footer and sections from template
  let effectiveHeaderId = header_id || null;
  let effectiveFooterId = footer_id || null;
  let blueprintSections = null;

  if (page_template_id && !sections?.length) {
    const [tpl] = await pool.query("SELECT header_id, footer_id FROM page_templates WHERE id = ?", [page_template_id]);
    if (tpl.length) {
      if (!effectiveHeaderId) effectiveHeaderId = tpl[0].header_id;
      if (!effectiveFooterId) effectiveFooterId = tpl[0].footer_id;
    }
    const [bpSections] = await pool.query(
      `SELECT pts.section_type_id, pts.sort_order, st.default_content, st.variables as type_variables
       FROM page_template_sections pts
       JOIN section_types st ON pts.section_type_id = st.id
       WHERE pts.page_template_id = ? ORDER BY pts.sort_order`,
      [page_template_id]
    );
    if (bpSections.length) blueprintSections = bpSections;
  }

  const [result] = await pool.query(
    "INSERT INTO pages (title, slug, header_id, footer_id, page_template_id, status, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [title, slug, effectiveHeaderId, effectiveFooterId, page_template_id || 1, status || "draft", category_id || null]
  );
  const pageId = result.insertId;

  if (sections?.length) {
    const values = sections.map((s, i) => [pageId, s.section_type_id, s.content, JSON.stringify(s.variables || {}), i]);
    await pool.query("INSERT INTO sections (page_id, section_type_id, content, variables, sort_order) VALUES ?", [values]);
  } else if (blueprintSections) {
    const values = blueprintSections.map(s => {
      // Auto-fill fixed variables
      const typeVars = (() => { try { return JSON.parse(s.type_variables || "[]"); } catch { return []; } })();
      const vars = {};
      for (const v of typeVars) {
        if (v.type === "fixed" && v.label) vars[v.key] = v.label;
      }
      return [pageId, s.section_type_id, s.default_content, JSON.stringify(vars), s.sort_order];
    });
    await pool.query("INSERT INTO sections (page_id, section_type_id, content, variables, sort_order) VALUES ?", [values]);
  }

  return NextResponse.json({ id: pageId }, { status: 201 });
}
