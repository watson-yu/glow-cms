"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const [pages, setPages] = useState([]);
  const [contentPath, setContentPath] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/pages").then(r => r.json()),
      fetch("/api/site-config").then(r => r.json()),
    ]).then(([p, c]) => {
      setPages(p);
      const cp = c.content_path || "";
      setContentPath(!cp || cp === "/" ? "" : cp.startsWith("/") ? cp : `/${cp}`);
      setLoading(false);
    });
  }, []);

  function publicUrl(slug) { return `${contentPath}/${slug}`; }

  async function deletePage(id) {
    if (!confirm("Delete this page?")) return;
    const res = await fetch(`/api/pages/${id}`, { method: "DELETE" });
    if (res.ok) setPages(prev => prev.filter(p => p.id !== id));
  }

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading...</p>;

  return (
    <>
      <div className="page-header">
        <h1>Pages</h1>
        <Link href="/cms-admin/pages/new/edit" className="btn btn-primary">+ Add New</Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Title</th><th>URL</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {pages.map(p => (
              <tr key={p.id}>
                <td><Link href={`/cms-admin/pages/${p.id}`} className="link">{p.title}</Link></td>
                <td style={{ fontSize: 13, color: "var(--text-muted)" }}>{publicUrl(p.slug)}</td>
                <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                <td>
                  <Link href={`/cms-admin/pages/${p.id}/edit`} className="btn btn-ghost btn-sm">Edit</Link>
                  <a href={`/preview/${p.slug}`} target="_blank" className="btn btn-ghost btn-sm">Preview</a>
                  <button onClick={() => deletePage(p.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }}>Delete</button>
                </td>
              </tr>
            ))}
            {!pages.length && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No pages yet. Create your first page!</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
