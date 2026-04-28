import pool from "@/lib/db";
import { getPool } from "@/lib/db";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { validId, validString, validSlug, validStatus, err } from "@/lib/validate";
import { getContentPath, renderPageSnapshot } from "@/lib/pages";

export async function GET(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {

    const { id } = await params;
    const [pages] = await pool.query(`
      SELECT p.*, h.name as header_name, h.content as header_content,
             f.name as footer_name, f.content as footer_content,
             pt.name as template_name, pt.content as template_content
      FROM pages p
      LEFT JOIN headers h ON p.header_id = h.id
      LEFT JOIN footers f ON p.footer_id = f.id
      LEFT JOIN page_templates pt ON p.page_template_id = pt.id
      WHERE p.id = ?
    `, [id]);
    if (!pages.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [sections] = await pool.query(`
      SELECT s.*, st.name as type_name, st.variables as type_variables FROM sections s
      JOIN section_types st ON s.section_type_id = st.id
      WHERE s.page_id = ? ORDER BY s.sort_order
    `, [id]);
    return NextResponse.json({ ...pages[0], sections });
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
    if (!validId(id)) return err("Invalid ID");
    const { title, slug, header_id, footer_id, page_template_id, status, sections, category_id } = await req.json();
    if (!validString(title, 500)) return err("title is required (max 500 chars)");
    if (!validSlug(slug)) return err("slug must be lowercase alphanumeric with hyphens");
    if (status && !validStatus(status)) return err("status must be draft or published");
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        "UPDATE pages SET title=?, slug=?, header_id=?, footer_id=?, page_template_id=?, status=?, category_id=? WHERE id=?",
        [title, slug, header_id || null, footer_id || null, page_template_id || 1, status, category_id || null, id]
      );
      await conn.query("DELETE FROM sections WHERE page_id = ?", [id]);
      if (sections?.length) {
        const values = sections.map((s, i) => [id, s.section_type_id, s.content, JSON.stringify(s.variables || {}), JSON.stringify(s.variable_origins || {}), i]);
        await conn.query("INSERT INTO sections (page_id, section_type_id, content, variables, variable_origins, sort_order) VALUES ?", [values]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    // Render/clear HTML snapshot based on status
    try {
      if (status === "published") await renderPageSnapshot(id);
      else await pool.query("UPDATE pages SET rendered_html = NULL WHERE id = ?", [id]);
    } catch (e) { console.error("Snapshot render error:", e); }
    try {
      const cp = await getContentPath();
      revalidatePath(`${cp}/${slug}`);
    } catch { /* revalidation is best-effort */ }
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
    const [rows] = await pool.query("SELECT status FROM pages WHERE id = ?", [id]);
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rows[0].status === "published") return NextResponse.json({ error: "Cannot delete a published page. Unpublish it first." }, { status: 409 });
    await pool.query("DELETE FROM pages WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
