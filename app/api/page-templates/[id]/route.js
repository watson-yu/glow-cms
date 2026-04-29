import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { validString, err } from "@/lib/validate";
import { clearAllSnapshots } from "@/lib/pages";

export async function GET(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await params;
    const [rows] = await pool.query("SELECT * FROM page_templates WHERE id = ?", [id]);
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let sections = [];
    try {
      [sections] = await pool.query("SELECT * FROM page_template_sections WHERE page_template_id = ? ORDER BY sort_order", [id]);
    } catch {
      // table may not exist yet (migration pending)
    }
    return NextResponse.json({ ...rows[0], sections });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const { id } = await params;
    const { name, content, header_id, footer_id, sections } = await req.json();
    if (!validString(name, 200)) return err("name is required (max 200 chars)");
    await pool.query(
      "UPDATE page_templates SET name=?, content=?, header_id=?, footer_id=? WHERE id=?",
      [name, content, header_id || null, footer_id || null, id]
    );
    try {
      await pool.query("DELETE FROM page_template_sections WHERE page_template_id = ?", [id]);
      if (sections?.length) {
        const values = sections.map((s, i) => [id, s.section_type_id, s.sort_order ?? i]);
        await pool.query("INSERT INTO page_template_sections (page_template_id, section_type_id, sort_order) VALUES ?", [values]);
      }
    } catch {
      // table may not exist yet (migration pending)
    }
    clearAllSnapshots().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const { id } = await params;
    await pool.query("DELETE FROM page_templates WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
