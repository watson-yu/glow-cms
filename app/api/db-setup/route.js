import mysql from "mysql2/promise";
import { NextResponse } from "next/server";
import { isDbConfigured, saveDbConfig, getPool } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const configured = isDbConfigured();
    // Whether Google auth is enabled — booleans only, never secret values, so this
    // stays unauthenticated and lets the admin shell decide to show the login page.
    let authConfigured = false;
    if (configured) {
      try {
        const [rows] = await getPool().query(
          "SELECT config_key, config_value FROM system_config WHERE config_key IN ('google_client_id','google_client_secret','nextauth_secret')"
        );
        const cfg = Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
        authConfigured = !!(cfg.google_client_id && cfg.google_client_secret && cfg.nextauth_secret);
      } catch { /* DB read failed — leave authConfigured = false */ }
    }
    return NextResponse.json({ configured, authConfigured });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    // First-time setup: allow without auth. Reconfiguration: require auth.
    if (isDbConfigured()) {
      const authError = await requireAuth(req);
      if (authError) return authError;
    }

    const { host, user, password, database, port } = await req.json();
    if (!host || !database) return NextResponse.json({ ok: false, error: "host and database are required" }, { status: 400 });
    const parsedPort = parseInt(port || "3306");
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) return NextResponse.json({ ok: false, error: "Invalid port" }, { status: 400 });
    const config = { host, user, password, database, port: parsedPort };

    try {
      const conn = await mysql.createConnection(config);
      // verify we can read a table
      await conn.query("SELECT 1 FROM site_config LIMIT 1");
      await conn.end();
    } catch (e) {
      console.error("DB connection test failed:", e);
      return NextResponse.json({ ok: false, error: "Connection failed — check credentials and host" }, { status: 400 });
    }

    saveDbConfig(config);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
