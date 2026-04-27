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
 * Also checks CSRF via Origin header on state-changing requests.
 */
export async function requireAuth(req) {
  // CSRF check: verify Origin matches Host on state-changing methods
  if (req && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host) {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
      }
    }
  }

  const authOptions = await getAuthOptions();
  if (!authOptions) return null;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
