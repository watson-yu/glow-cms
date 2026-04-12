import Link from "next/link";
import { getPool } from "@/lib/db";

async function getSiteConfig() {
  try {
    const pool = getPool();
    if (!pool) return {};
    const [rows] = await pool.query("SELECT config_key, config_value FROM site_config WHERE config_key IN ('site_title','logo_url')");
    return Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
  } catch { return {}; }
}

export default async function Home() {
  const config = await getSiteConfig();

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", color: "#18181b", fontFamily: "'Inter', -apple-system, sans-serif", overflow: "hidden", position: "relative" }}>
      {/* Ambient glow */}
      <div style={{ position: "absolute", top: "-30%", left: "50%", transform: "translateX(-50%)", width: "800px", height: "800px", background: "radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(168,85,247,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Nav */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 40px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {config.logo_url && <img src={config.logo_url} alt="" style={{ height: 28, borderRadius: 4 }} />}
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: "#27272a" }}>{config.site_title || "Glow CMS"}</span>
        </div>
        <Link href="/cms-admin" style={{ fontSize: 14, color: "#71717a", textDecoration: "none", padding: "8px 20px", border: "1px solid #e4e4e7", borderRadius: 999, transition: "all 0.2s" }}>
          Admin Console
        </Link>
      </nav>

      {/* Hero */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 80px)", padding: "0 24px", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#3b82f6", marginBottom: 24 }}>
          AI-Powered Content Management
        </div>

        <h1 style={{ fontSize: "clamp(40px, 7vw, 80px)", fontWeight: 800, margin: "0 0 24px", letterSpacing: "-0.04em", lineHeight: 1.05, textAlign: "center", maxWidth: 800 }}>
          <span style={{ background: "linear-gradient(135deg, #18181b 0%, #52525b 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Craft stunning pages
          </span>
          <br />
          <span style={{ background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            with AI
          </span>
        </h1>

        <p style={{ fontSize: 18, color: "#71717a", maxWidth: 520, textAlign: "center", lineHeight: 1.7, margin: "0 0 48px" }}>
          Templates, sections, and layouts — all generated and managed through an intelligent prompt system with full version control.
        </p>

        <div style={{ display: "flex", gap: 16, marginBottom: 80 }}>
          <Link href="/cms-admin" style={{ background: "#18181b", color: "#fafafa", padding: "14px 36px", borderRadius: 999, fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-block" }}>
            Get Started
          </Link>
          <a href="https://github.com/watson-yu/glow-cms" target="_blank" rel="noopener" style={{ padding: "14px 36px", borderRadius: 999, fontSize: 15, fontWeight: 500, textDecoration: "none", color: "#52525b", border: "1px solid #e4e4e7", display: "inline-block" }}>
            GitHub
          </a>
        </div>

        {/* Feature pills */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, maxWidth: 700 }}>
          {[
            "{{variable}} Templates",
            "OpenAI · Claude · Gemini",
            "3-Level Prompt System",
            "Version History",
            "Live Preview",
            "Google OAuth",
          ].map(f => (
            <span key={f} style={{ fontSize: 13, color: "#71717a", padding: "8px 18px", borderRadius: 999, border: "1px solid #e4e4e7", background: "#fff" }}>
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
