"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const [pages, setPages] = useState([]);
  const [contentPath, setContentPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function loadPages() {
    return fetch("/api/pages").then(r => r.json()).then(p => { setPages(p); return p; });
  }

  useEffect(() => {
    Promise.all([
      loadPages(),
      fetch("/api/site-config").then(r => r.json()),
    ]).then(([p, c]) => {
      const cp = c.content_path || "";
      setContentPath(!cp || cp === "/" ? "" : cp.startsWith("/") ? cp : `/${cp}`);
      setLoading(false);
    });
  }, []);

  // Auto-refresh while any page is generating
  useEffect(() => {
    if (!pages.some(p => p.status === "generating")) return;
    const t = setInterval(loadPages, 3000);
    return () => clearInterval(t);
  }, [pages]);

  function publicUrl(slug) { return `${contentPath}/${slug}`; }

  async function deletePage() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/pages/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) setPages(prev => prev.filter(p => p.id !== deleteTarget.id));
    else { const d = await res.json().catch(() => ({})); alert(d.error || "Delete failed"); }
    setDeleting(false);
    setDeleteTarget(null);
  }

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading...</p>;

  return (
    <>
      <div className="page-header">
        <h1>Pages</h1>
        <Link href="/cms-admin/pages/new/edit" className="btn btn-primary">+ Add New</Link>
      </div>
      <div className="table-wrap">
        <table aria-label="Pages list">
          <thead>
            <tr><th>Title</th><th>URL</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {pages.map(p => (
              <tr key={p.id}>
                <td><Link href={`/cms-admin/pages/${p.id}`} className="link">{p.title}</Link></td>
                <td style={{ fontSize: 13, color: "var(--text-muted)" }}>{publicUrl(p.slug)}</td>
                <td>
                  <span className={`badge badge-${p.status}`}>{p.status.replace(/_/g, " ")}</span>
                </td>
                <td>
                  <Link href={`/cms-admin/pages/${p.id}/edit`} className="btn btn-ghost btn-sm">Edit</Link>
                  <a href={`/preview/${p.slug}`} target="_blank" className="btn btn-ghost btn-sm">Preview</a>
                  <button onClick={() => setDeleteTarget(p)} className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} disabled={p.status === "published"} title={p.status === "published" ? "Unpublish before deleting" : ""}>Delete</button>
                </td>
              </tr>
            ))}
            {!pages.length && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No pages yet. Create your first page!</td></tr>}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 400, width: "100%", margin: 20 }}>
            <div className="card-title">Delete Page</div>
            <p style={{ fontSize: 14, marginBottom: 16 }}>Delete <strong>{deleteTarget.title}</strong>? This cannot be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
              <button className="btn btn-primary btn-sm" style={{ background: "var(--danger)" }} onClick={deletePage} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
