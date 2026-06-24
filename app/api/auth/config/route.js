// Public, secret-free status endpoint. The admin shell uses this to decide
// whether to show DB setup, the login screen, or the app — without depending on
// any auth-gated route. It lives under /api/auth/* so the proxy gate leaves it
// reachable, and it never returns secrets (only two booleans).
import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { isOAuthConfigured } from "@/lib/auth";

export async function GET() {
  const dbConfigured = isDbConfigured();
  const authRequired = dbConfigured ? await isOAuthConfigured() : false;
  return NextResponse.json({ dbConfigured, authRequired });
}
