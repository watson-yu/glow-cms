import pool from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const [rows] = await pool.query(
    `SELECT p.id, p.title, p.slug, p.status FROM sections s
     JOIN pages p ON s.page_id = p.id
     WHERE s.section_type_id = ?
     GROUP BY p.id ORDER BY p.title`,
    [id]
  );
  return NextResponse.json({ count: rows.length, pages: rows });
}
