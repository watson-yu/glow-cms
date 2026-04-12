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
  const { title, slug, header_id, footer_id, page_template_id, status, sections } = await req.json();
  const [result] = await pool.query(
    "INSERT INTO pages (title, slug, header_id, footer_id, page_template_id, status) VALUES (?, ?, ?, ?, ?, ?)",
    [title, slug, header_id || null, footer_id || null, page_template_id || 1, status || "draft"]
  );
  const pageId = result.insertId;
  if (sections?.length) {
    const values = sections.map((s, i) => [pageId, s.section_type_id, s.content, i]);
    await pool.query("INSERT INTO sections (page_id, section_type_id, content, sort_order) VALUES ?", [values]);
  }
  return NextResponse.json({ id: pageId }, { status: 201 });
}
