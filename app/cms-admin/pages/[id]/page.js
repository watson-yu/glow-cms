"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { substituteVars } from "@/lib/template";
import SafeHtml from "@/app/components/SafeHtml";

export default function ViewPage() {
  const { id } = useParams();
  const [page, setPage] = useState(null);
  const [config, setConfig] = useState({});

  useEffect(() => {
    fetch(`/api/pages/${id}`).then(r => r.json()).then(setPage);
    fetch("/api/site-config").then(r => r.json()).then(setConfig);
  }, [id]);

  if (!page) return <p style={{ color: "var(--text-muted)" }}>Loading...</p>;

  const sub = (html, vars) => {
    let out = vars ? substituteVars(html, vars) : html;
    return substituteVars(out, config, { stripUnresolved: true });
  };

  return (
    <>
      <Link href="/cms-admin" className="back-link">← Back to Pages</Link>
      <div className="page-header">
        <div>
          <h1>{page.title}</h1>
          <div style={{ marginTop: 4, fontSize: 14, color: "var(--text-muted)" }}>
            /{page.slug} · <span className={`badge badge-${page.status}`}>{page.status}</span>
            {page.header_name && <> · Header: {page.header_name}</>}
            {page.footer_name && <> · Footer: {page.footer_name}</>}
          </div>
        </div>
        <Link href={`/cms-admin/pages/${id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
      </div>

      {page.header_content && (
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Header</div>
          <SafeHtml html={sub(page.header_content)} />
        </div>
      )}

      {page.sections?.map((s, i) => {
        const typeVars = (() => { try { return typeof s.type_variables === "string" ? JSON.parse(s.type_variables || "[]") : (s.type_variables || []); } catch { return []; } })();
        const pageVars = (() => { try { return typeof s.variables === "string" ? JSON.parse(s.variables || "{}") : (s.variables || {}); } catch { return {}; } })();
        const defaults = {};
        const ctx = { ...config, title: page.title, slug: page.slug };
        for (const v of typeVars) {
          if (v.type === "fixed" && v.label) defaults[v.key] = substituteVars(v.label, ctx);
        }
        const vars = { ...defaults, ...pageVars };
        return (
          <div key={i} className="card">
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>🧩 {s.type_name}</div>
            <SafeHtml html={sub(s.content, vars)} />
          </div>
        );
      })}

      {page.footer_content && (
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Footer</div>
          <SafeHtml html={sub(page.footer_content)} />
        </div>
      )}
    </>
  );
}
