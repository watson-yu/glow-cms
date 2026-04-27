import { getServerSession } from "next-auth";
import { getPool } from "@/lib/db";
import { NextResponse } from "next/server";

async function getAuthOptions() {
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    "SELECT config_key, config_value FROM system_config WHERE config_key IN ('google_client_id','google_client_secret','nextauth_secret')"
  );
  const cfg = Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
  if (!cfg.google_client_id || !cfg.google_client_secret || !cfg.nextauth_secret) return null;
  const GoogleProvider = (await import("next-auth/providers/google")).default;
  return {
    providers: [GoogleProvider({ clientId: cfg.google_client_id, clientSecret: cfg.google_client_secret })],
    secret: cfg.nextauth_secret,
  };
}

/**
 * Returns null if auth passes (or auth not configured), or a 401 NextResponse.
 */
export async function requireAuth() {
  const authOptions = await getAuthOptions();
  if (!authOptions) return null; // auth not configured — allow access
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
