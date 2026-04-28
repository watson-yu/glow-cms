import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { validString, err } from "@/lib/validate";

export async function GET(req) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const [rows] = await pool.query("SELECT * FROM page_templates ORDER BY id");
    const include = new URL(req.url).searchParams.get("include");
    if (include === "sections") {
      let sections = [];
      try {
        [sections] = await pool.query("SELECT * FROM page_template_sections ORDER BY page_template_id, sort_order");
      } catch { }
      const sectionsByTemplate = {};
      for (const s of sections) {
        (sectionsByTemplate[s.page_template_id] ||= []).push(s);
      }
      return NextResponse.json(rows.map(r => ({ ...r, sections: sectionsByTemplate[r.id] || [] })));
    }
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const { name, content, header_id, footer_id, sections } = await req.json();
    if (!validString(name, 200)) return err("name is required (max 200 chars)");
    const [r] = await pool.query(
      "INSERT INTO page_templates (name, content, header_id, footer_id) VALUES (?, ?, ?, ?)",
      [name, content, header_id || null, footer_id || null]
    );
    if (sections?.length) {
      const values = sections.map((s, i) => [r.insertId, s.section_type_id, s.sort_order ?? i]);
      await pool.query("INSERT INTO page_template_sections (page_template_id, section_type_id, sort_order) VALUES ?", [values]);
    }
    return NextResponse.json({ id: r.insertId }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
