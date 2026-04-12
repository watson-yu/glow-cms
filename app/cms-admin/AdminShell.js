"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const P = "/cms-admin";

const sections = [
  { label: "Content", items: [
    { href: `${P}`, label: "Pages" },
  ]},
  { label: "Components", items: [
    { href: `${P}/headers`, label: "Headers" },
    { href: `${P}/footers`, label: "Footers" },
    { href: `${P}/page-templates`, label: "Page Templates" },
    { href: `${P}/section-types`, label: "Section Types" },
  ]},
  { label: "Settings", items: [
    { href: `${P}/prompts`, label: "Prompts" },
    { href: `${P}/site-config`, label: "Site Config" },
    { href: `${P}/system-config`, label: "System Config" },
  ]},
];

export default function AdminShell({ children }) {
  const path = usePathname();
  const [site, setSite] = useState({ site_title: "", logo_url: "" });

  useEffect(() => {
    fetch("/api/site-config").then(r => r.json()).then(c => setSite(c));
  }, []);

  return (
    <>
      <header className="admin-header">
        <Link href={P} className="logo">
          {site.logo_url ? <img src={site.logo_url} alt="" style={{ height: 28, borderRadius: 4 }} /> : <span>✦</span>}
          {site.site_title || "Glow CMS"}
        </Link>
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
