import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import pool from "@/lib/db";

async function getConfig(key) {
  const [rows] = await pool.query("SELECT config_value FROM system_config WHERE config_key = ?", [key]);
  return rows[0]?.config_value || "";
}

function isEmailAllowed(email, allowedLogins) {
  if (!allowedLogins.trim()) return true; // empty = allow all
  const rules = allowedLogins.split("\n").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const lower = email.toLowerCase();
  return rules.some(rule =>
    rule.startsWith("@") ? lower.endsWith(rule) : lower === rule
  );
}

async function getAuthOptions() {
  const [clientId, clientSecret] = await Promise.all([
    getConfig("google_client_id"),
    getConfig("google_client_secret"),
  ]);
  return {
    providers: [
      GoogleProvider({ clientId, clientSecret }),
    ],
    secret: process.env.NEXTAUTH_SECRET || "glow-cms-default-secret",
    callbacks: {
      async signIn({ user }) {
        const allowed = await getConfig("allowed_logins");
        if (!isEmailAllowed(user.email || "", allowed)) return false;
        await pool.query(
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
  const authOptions = await getAuthOptions();
  return NextAuth(req, ctx, authOptions);
}

export { handler as GET, handler as POST };
