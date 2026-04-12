import mysql from "mysql2/promise";
import { NextResponse } from "next/server";
import { isDbConfigured, saveDbConfig } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ configured: isDbConfigured() });
}

export async function POST(req) {
  const { host, user, password, database, port } = await req.json();
  const config = { host, user, password, database, port: parseInt(port || "3306") };

  try {
    const conn = await mysql.createConnection(config);
    // verify we can read a table
    await conn.query("SELECT 1 FROM site_config LIMIT 1");
    await conn.end();
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }

  saveDbConfig(config);
  return NextResponse.json({ ok: true });
}
