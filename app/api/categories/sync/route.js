import pool from "@/lib/db";
import mysql from "mysql2/promise";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

async function getExtConfig() {
  const keys = ["ext_db_host", "ext_db_port", "ext_db_name", "ext_db_user", "ext_db_password", "ext_db_query_l1", "ext_db_query_l2"];
  const [rows] = await pool.query("SELECT config_key, config_value FROM system_config WHERE config_key IN (?)", [keys]);
  return Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
}

const DEFAULT_L1 = "SELECT id, zh_tw_name AS name, slug, zh_tw_description AS description FROM categories ORDER BY id";
const DEFAULT_L2 = `SELECT ct.category_id AS parent_id, t.id, t.zh_tw_name AS name, t.slug, t.zh_tw_description AS description, ct.is_primary, t.display_order
  FROM category_treatment ct JOIN treatments t ON ct.treatment_id = t.id ORDER BY ct.category_id, t.display_order`;

export async function POST() {
  const authError = await requireAuth();
  if (authError) return authError;

  const cfg = await getExtConfig();
  if (!cfg.ext_db_host || !cfg.ext_db_name) {
    return NextResponse.json({ error: "External DB not configured" }, { status: 400 });
  }

  const ext = await mysql.createConnection({
    host: cfg.ext_db_host, port: parseInt(cfg.ext_db_port || "3306"),
    user: cfg.ext_db_user, password: cfg.ext_db_password, database: cfg.ext_db_name,
  });

  try {
    const [l1Rows] = await ext.query(cfg.ext_db_query_l1 || DEFAULT_L1);
    const [l2Rows] = await ext.query(cfg.ext_db_query_l2 || DEFAULT_L2);

    // Upsert L1 (external categories → local parent categories)
    for (const r of l1Rows) {
      await pool.query(
        "INSERT INTO categories (id, name, slug, description, parent_id, sort_order) VALUES (?, ?, ?, ?, NULL, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), slug=VALUES(slug), description=VALUES(description)",
        [r.id, r.name, r.slug || `cat-${r.id}`, r.description || null, r.sort_order ?? 0]
      );
    }

    // Upsert L2 (treatments → local child categories, keyed by category_id * 100000 + treatment_id)
    for (const r of l2Rows) {
      const localId = r.parent_id * 100000 + r.id;
      await pool.query(
        "INSERT INTO categories (id, name, slug, description, parent_id, sort_order) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), slug=VALUES(slug), description=VALUES(description), parent_id=VALUES(parent_id), sort_order=VALUES(sort_order)",
        [localId, r.name, r.slug || `treat-${r.id}`, r.description || null, r.parent_id, r.display_order ?? 0]
      );
    }

    return NextResponse.json({ synced: { l1: l1Rows.length, l2: l2Rows.length } });
  } finally {
    await ext.end();
  }
}
