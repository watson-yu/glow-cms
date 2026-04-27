import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const [rows] = await pool.query(`
      SELECT p.*, h.name as header_name, f.name as footer_name, pt.name as template_name
      FROM pages p
      LEFT JOIN headers h ON p.header_id = h.id
      LEFT JOIN footers f ON p.footer_id = f.id
      LEFT JOIN page_templates pt ON p.page_template_id = pt.id
      ORDER BY p.created_at DESC
    `);
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const { title, slug, header_id, footer_id, page_template_id, status, sections, category_id } = await req.json();
    const [result] = await pool.query(
      "INSERT INTO pages (title, slug, header_id, footer_id, page_template_id, status, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [title, slug, header_id || null, footer_id || null, page_template_id || 1, status || "draft", category_id || null]
    );
    const pageId = result.insertId;
    if (sections?.length) {
      const values = sections.map((s, i) => [pageId, s.section_type_id, s.content, JSON.stringify(s.variables || {}), JSON.stringify(s.variable_origins || {}), i]);
      await pool.query("INSERT INTO sections (page_id, section_type_id, content, variables, variable_origins, sort_order) VALUES ?", [values]);
    }
    return NextResponse.json({ id: pageId }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
