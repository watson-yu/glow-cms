import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { isDbConfigured, getPool } from "@/lib/db";
import { getConfig, isEmailAllowed, resolveAuthUrl } from "@/lib/auth";
import { NextResponse } from "next/server";

async function getAuthOptions() {
  const [clientId, clientSecret, secret] = await Promise.all([
    getConfig("google_client_id"),
    getConfig("google_client_secret"),
    getConfig("nextauth_secret"),
  ]);
  if (!clientId || !clientSecret || !secret) {
    throw new Error("Google auth is not fully configured");
  }
  return {
    providers: [
      GoogleProvider({ clientId, clientSecret }),
    ],
    secret,
    callbacks: {
      async signIn({ user }) {
        const allowed = await getConfig("allowed_logins");
        if (!isEmailAllowed(user.email || "", allowed)) return false;
        await getPool().query(
          `INSERT INTO users (email, name, image, last_login) VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE name=VALUES(name), image=VALUES(image), last_login=NOW()`,
          [user.email, user.name, user.image]
        );
        return true;
      },
    },
    pages: {
      error: "/cms-admin",
    },
  };
}

async function handler(req, ctx) {
  if (!isDbConfigured()) return NextResponse.json({});
  let authOptions;
  try {
    authOptions = await getAuthOptions();
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Resolve NEXTAUTH_URL from a trusted source only (deploy-time env, or an
  // explicitly allow-listed host). Never derive it from an arbitrary Host header,
  // and never clobber an already-set deploy-time value on a per-request basis.
  if (!process.env.NEXTAUTH_URL) {
    const url = resolveAuthUrl(req);
    if (url) process.env.NEXTAUTH_URL = url;
  }
  return NextAuth(req, ctx, authOptions);
}

export { handler as GET, handler as POST };
