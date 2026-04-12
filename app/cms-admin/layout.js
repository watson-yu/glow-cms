import { isDbConfigured, getPool } from "@/lib/db";
import AdminShell from "./AdminShell";

export async function generateMetadata() {
  if (!isDbConfigured()) return { title: "Glow CMS — Setup" };
  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT config_key, config_value FROM site_config WHERE config_key IN ('site_title','logo_url')");
    const config = Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
    return {
      title: config.site_title ? `${config.site_title} — Admin` : "Glow CMS",
      icons: config.logo_url ? [{ url: config.logo_url }] : undefined,
    };
  } catch {
    return { title: "Glow CMS — Setup" };
  }
}

import AuthProvider from "./components/AuthProvider";

export default function CmsAdminLayout({ children }) {
  return <AuthProvider><AdminShell>{children}</AdminShell></AuthProvider>;
}
