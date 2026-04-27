"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { substituteVars } from "@/lib/template";

export default function ViewPage() {
  const { id } = useParams();
  const [page, setPage] = useState(null);
  const [config, setConfig] = useState({});

  useEffect(() => {
    fetch(`/api/pages/${id}`).then(r => r.json()).then(setPage);
    fetch("/api/site-config").then(r => r.json()).then(setConfig);
  }, [id]);

  if (!page) return <p style={{ color: "var(--text-muted)" }}>Loading...</p>;

  const sub = (html) => substituteVars(html, config, { stripUnresolved: true });

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
          <div dangerouslySetInnerHTML={{ __html: sub(page.header_content) }} />
        </div>
      )}

      {page.sections?.map((s, i) => (
        <div key={i} className="card">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>🧩 {s.type_name}</div>
          <div dangerouslySetInnerHTML={{ __html: sub(s.content) }} />
        </div>
      ))}

      {page.footer_content && (
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Footer</div>
          <div dangerouslySetInnerHTML={{ __html: sub(page.footer_content) }} />
        </div>
      )}
    </>
  );
}
