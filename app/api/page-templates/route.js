import pool from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [rows] = await pool.query("SELECT * FROM page_templates ORDER BY id");
  const [sections] = await pool.query("SELECT * FROM page_template_sections ORDER BY page_template_id, sort_order");
  const sectionsByTemplate = {};
  for (const s of sections) {
    (sectionsByTemplate[s.page_template_id] ||= []).push(s);
  }
  return NextResponse.json(rows.map(r => ({ ...r, sections: sectionsByTemplate[r.id] || [] })));
}

export async function POST(req) {
  const { name, content, header_id, footer_id, sections } = await req.json();
  const [r] = await pool.query(
    "INSERT INTO page_templates (name, content, header_id, footer_id) VALUES (?, ?, ?, ?)",
    [name, content, header_id || null, footer_id || null]
  );
  if (sections?.length) {
    const values = sections.map((s, i) => [r.insertId, s.section_type_id, s.sort_order ?? i]);
    await pool.query("INSERT INTO page_template_sections (page_template_id, section_type_id, sort_order) VALUES ?", [values]);
  }
  return NextResponse.json({ id: r.insertId }, { status: 201 });
}
