"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import BulkGenerate from "./components/BulkGenerate";

export default function Home() {
  const [pages, setPages] = useState([]);
  const [contentPath, setContentPath] = useState("");
  const [sectionTypes, setSectionTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [statusFilter, setStatusFilter] = useState("all"); // all | draft | published
  const [categoryFilter, setCategoryFilter] = useState("all"); // "all" | category id (string)
  const [showBulk, setShowBulk] = useState(false);

  const loadPages = () => fetch("/api/pages").then(r => r.json()).then(setPages);

  useEffect(() => {
    loadPages();
    fetch("/api/site-config").then(r => r.json()).then(c => {
      const cp = c.content_path || "";
      setContentPath(!cp || cp === "/" ? "" : cp.startsWith("/") ? cp : `/${cp}`);
    });
    fetch("/api/section-types").then(r => r.json()).then(setSectionTypes);
    fetch("/api/categories").then(r => r.json()).then(setCategories);
  }, []);

  function publicUrl(slug) { return `${contentPath}/${slug}`; }

  async function deletePage(id) {
    if (!confirm("Delete this page?")) return;
    await fetch(`/api/pages/${id}`, { method: "DELETE" });
    setPages(pages.filter(p => p.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  const visible = useMemo(() => pages.filter(p =>
    (statusFilter === "all" || p.status === statusFilter) &&
    (categoryFilter === "all" || String(p.category_id) === categoryFilter)
  ), [pages, statusFilter, categoryFilter]);

  const visibleIds = visible.map(p => p.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(prev => allVisibleSelected ? new Set([...prev].filter(id => !visibleIds.includes(id))) : new Set([...prev, ...visibleIds]));
  }

  const selectedPages = pages.filter(p => selected.has(p.id));

  return (
    <>
      <div className="page-header">
        <h1>Pages</h1>
        <Link href="/cms-admin/pages/new/edit" className="btn btn-primary">+ Add New</Link>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-muted)" }}>Status</label>
        <select className="form-input" style={{ width: 130 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <label style={{ fontSize: 13, color: "var(--text-muted)" }}>Category</label>
        <select className="form-input" style={{ width: 200 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">All</option>
          {categories.map(p => [
            <option key={p.id} value={String(p.id)}>{p.name}</option>,
            ...(p.children || []).map(c => <option key={c.id} value={String(c.id)}>&nbsp;&nbsp;↳ {c.name}</option>)
          ])}
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{selected.size} selected</span>
        <button className="btn btn-primary btn-sm" disabled={!selected.size || !sectionTypes.length} onClick={() => setShowBulk(true)} title={!sectionTypes.length ? "Create a section type first" : ""}>
          ✨ Generate Content ({selected.size})
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>
              <th>Title</th><th>URL</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(p => (
              <tr key={p.id}>
                <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
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
            {!visible.length && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>{pages.length ? "No pages match the filters." : "No pages yet. Create your first page!"}</td></tr>}
          </tbody>
        </table>
      </div>

      {showBulk && (
        <BulkGenerate
          pages={selectedPages}
          sectionTypes={sectionTypes}
          categories={categories}
          onClose={() => setShowBulk(false)}
          onDone={loadPages}
        />
      )}
    </>
  );
}
