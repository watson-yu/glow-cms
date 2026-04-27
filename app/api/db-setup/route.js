import mysql from "mysql2/promise";
import { NextResponse } from "next/server";
import { isDbConfigured, saveDbConfig } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    return NextResponse.json({ configured: isDbConfigured() });
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
