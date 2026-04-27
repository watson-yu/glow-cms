"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import DbSetup from "./components/DbSetup";

const P = "/cms-admin";

const sections = [
  { label: "Content", items: [
    { href: `${P}`, label: "Pages" },
    { href: `${P}/categories`, label: "Categories" },
  ]},
  { label: "Components", items: [
    { href: `${P}/headers`, label: "Headers" },
    { href: `${P}/footers`, label: "Footers" },
    { href: `${P}/page-templates`, label: "Page Templates" },
    { href: `${P}/section-types`, label: "Section Types" },
  ]},
  { label: "Settings", items: [
    { href: `${P}/users`, label: "Users" },
    { href: `${P}/prompts`, label: "Prompts" },
    { href: `${P}/generation-logs`, label: "Generation Logs" },
    { href: `${P}/site-config`, label: "Site Config" },
    { href: `${P}/system-config`, label: "System Config" },
  ]},
];

const TZ_OPTIONS = [
  { label: "UTC", value: "UTC" },
  { label: "Taipei", value: "Asia/Taipei" },
];

function ProfileDropdown({ authConfigured }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [tz, setTz] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("glow-tz")) || "Asia/Taipei");

  function toggleTz(value) {
    setTz(value);
    localStorage.setItem("glow-tz", value);
    window.dispatchEvent(new Event("tz-change"));
  }

  return (
    <div style={{ position: "relative", marginLeft: "auto" }}>
      <button onClick={() => setOpen(!open)} className="profile-btn" title={session?.user?.email || "Account"}>
        {session?.user?.image
          ? <img src={session.user.image} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
          : <span style={{ width: 28, height: 28, borderRadius: "50%", background: authConfigured ? "var(--border)" : "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{authConfigured ? "👤" : "⚠️"}</span>
        }
      </button>
      {open && (
        <>
          <div className="profile-overlay" onClick={() => setOpen(false)} />
          <div className="profile-dropdown">
            {!authConfigured ? (
              <>
                <div className="profile-dropdown-item" style={{ cursor: "default", fontSize: 12, color: "#b45309", fontWeight: 500 }}>Auth not configured</div>
                <div className="profile-dropdown-item" style={{ cursor: "default", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Set up Google OAuth in<br />System Config to enable login.
                </div>
                <div className="profile-dropdown-divider" />
                <Link href="/cms-admin/system-config" className="profile-dropdown-item" onClick={() => setOpen(false)} style={{ color: "var(--primary)", fontWeight: 500, textDecoration: "none", display: "block" }}>
                  Go to System Config →
                </Link>
              </>
            ) : session ? (
              <>
                <div className="profile-dropdown-item" style={{ fontWeight: 500, color: "var(--text)", cursor: "default" }}>{session.user.email}</div>
                <div className="profile-dropdown-divider" />
                <div className="profile-dropdown-item" style={{ cursor: "default", fontSize: 12, color: "var(--text-muted)" }}>Timezone</div>
                {TZ_OPTIONS.map(o => (
                  <div key={o.value} className="profile-dropdown-item" onClick={() => toggleTz(o.value)} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 16 }}>{tz === o.value ? "✓" : ""}</span>{o.label}
                  </div>
                ))}
                <div className="profile-dropdown-divider" />
                <div className="profile-dropdown-item" onClick={() => signOut()}>Logout</div>
              </>
            ) : (
              <div className="profile-dropdown-item" onClick={() => signIn("google")}>Sign in with Google</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LoginPage({ logoUrl, siteTitle }) {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "var(--bg)" }}>
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ height: 28, borderRadius: 4 }} />}
        <span style={{ fontWeight: 700, fontSize: 18, color: "#808080" }}>{siteTitle || "Glow CMS"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 60px)" }}>
        <button onClick={() => signIn("google")} className="btn btn-primary" style={{ fontSize: 15, padding: "10px 28px" }}>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

export default function AdminShell({ children }) {
  const path = usePathname();
  const { data: session, status } = useSession();
  const [site, setSite] = useState({ site_title: "", logo_url: "" });
  const [dbReady, setDbReady] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    fetch("/api/db-setup").then(r => r.json()).then(d => {
      setDbReady(d.configured);
      if (d.configured) {
        fetch("/api/site-config").then(r => r.json()).then(c => setSite(c));
        fetch("/api/system-config").then(r => r.json()).then(c => {
          setAuthRequired(!!(c.google_client_id && c.google_client_secret?.hasValue && c.nextauth_secret?.hasValue));
        });
      }
    });
  }, []);

  if (dbReady === null || status === "loading") return <p style={{ color: "var(--text-muted)", padding: 24 }}>Loading...</p>;
  if (!dbReady) return <DbSetup />;
  if (authRequired && !session) return <LoginPage logoUrl={site.logo_url} siteTitle={site.site_title} />;

  return (
    <>
      <header className="admin-header">
        <Link href={P} className="logo">
          {site.logo_url ? <img src={site.logo_url} alt="" style={{ height: 28, borderRadius: 4 }} /> : <span>✦</span>}
          {site.site_title || "Glow CMS"}
        </Link>
        <ProfileDropdown authConfigured={authRequired} />
      </header>
      <nav className="admin-sidebar">
        {sections.map(s => (
          <div key={s.label}>
            <div className="nav-label">{s.label}</div>
            <ul>
              {s.items.map(n => (
                <li key={n.href}>
                  <Link href={n.href} className={path === n.href || (n.href !== P && path.startsWith(n.href)) ? "active" : ""}>
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <main className="admin-main">{children}</main>
    </>
  );
}
