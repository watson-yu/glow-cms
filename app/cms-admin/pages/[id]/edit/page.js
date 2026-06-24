"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function EditPage() {
  const { id } = useParams();
  const router = useRouter();
  const isNew = id === "new";
  const [form, setForm] = useState({ title: "", slug: "", header_id: "", footer_id: "", page_template_id: "", status: "draft", category_id: "", meta_title: "", meta_description: "", og_image: "", canonical: "", sections: [] });
  const [headers, setHeaders] = useState([]);
  const [footers, setFooters] = useState([]);
  const [pageTemplates, setPageTemplates] = useState([]);
  const [sectionTypes, setSectionTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contentPath, setContentPath] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/headers").then(r => r.json()),
      fetch("/api/footers").then(r => r.json()),
      fetch("/api/page-templates").then(r => r.json()),
      fetch("/api/section-types").then(r => r.json()),
      fetch("/api/site-config").then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
    ]).then(([h, f, pt, st, c, cats]) => {
      setHeaders(h);
      setFooters(f);
      setPageTemplates(pt);
      setSectionTypes(st);
      setCategories(cats);
      const cp = c.content_path || "";
      setContentPath(!cp || cp === "/" ? "" : cp.startsWith("/") ? cp : `/${cp}`);
      if (isNew) {
        setForm(prev => ({ ...prev, header_id: h[0]?.id || "", footer_id: f[0]?.id || "", page_template_id: pt[0]?.id || "" }));
      }
    });
    if (!isNew) fetch(`/api/pages/${id}`).then(r => r.json()).then(d => setForm({
      ...d, header_id: d.header_id || "", footer_id: d.footer_id || "", page_template_id: d.page_template_id || "", category_id: d.category_id || "",
      meta_title: d.meta_title || "", meta_description: d.meta_description || "", og_image: d.og_image || "", canonical: d.canonical || "",
      sections: (d.sections || []).map(s => ({
        ...s,
        variables: typeof s.variables === "string" ? JSON.parse(s.variables || "{}") : (s.variables || {}),
        type_variables: typeof s.type_variables === "string" ? JSON.parse(s.type_variables || "[]") : (s.type_variables || []),
      }))
    }));
  }, [id, isNew]);

  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value });

  function addSection(typeId) {
    const type = sectionTypes.find(t => t.id === Number(typeId));
    if (!type) return;
    const typVars = typeof type.variables === "string" ? JSON.parse(type.variables || "[]") : (type.variables || []);
    setForm({ ...form, sections: [...form.sections, { section_type_id: type.id, type_name: type.name, content: type.default_content || "", type_variables: typVars, variables: {} }] });
  }

  function removeSection(i) {
    setForm({ ...form, sections: form.sections.filter((_, j) => j !== i) });
  }

  async function save(e) {
    e.preventDefault();
    const url = isNew ? "/api/pages" : `/api/pages/${id}`;
    await fetch(url, { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    router.push("/cms-admin");
  }

  return (
    <>
      <Link href="/cms-admin" className="back-link">← Back to Pages</Link>
      <div className="page-header"><h1>{isNew ? "Add New Page" : "Edit Page"}</h1></div>
      <form onSubmit={save}>
        <div className="card">
          <div className="card-title">Page Info</div>
          <div className="form-field"><label>Title</label><input value={form.title} onChange={set("title")} required className="form-input" /></div>
          <div className="form-field"><label>Slug</label><input value={form.slug} onChange={set("slug")} required className="form-input" />
            {form.slug && (
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
                Public: <code>{contentPath}/{form.slug}</code> · Preview: <a href={`/preview/${form.slug}`} target="_blank" className="link" style={{ fontSize: 13 }}>/preview/{form.slug}</a>
              </div>
            )}
          </div>
          <div className="form-field">
            <label>Status</label>
            <select value={form.status} onChange={set("status")} className="form-input">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
          <div className="form-field">
            <label>Category</label>
            <select value={form.category_id} onChange={set("category_id")} className="form-input">
              <option value="">— None —</option>
              {categories.map(p => [
                <option key={p.id} value={p.id}>{p.name}</option>,
                ...p.children.map(c => <option key={c.id} value={c.id}>&nbsp;&nbsp;↳ {c.name}</option>)
              ])}
            </select>
          </div>
        </div>

        <div className="card">
          <div className="card-title">SEO</div>
          <div className="form-field">
            <label>Meta Title</label>
            <input value={form.meta_title} onChange={set("meta_title")} className="form-input" placeholder={form.title || "Falls back to page title"} />
          </div>
          <div className="form-field">
            <label>Meta Description</label>
            <textarea value={form.meta_description} onChange={set("meta_description")} rows={3} className="form-input" placeholder="Shown in search results and social shares" />
          </div>
          <div className="form-field">
            <label>OG Image URL</label>
            <input value={form.og_image} onChange={set("og_image")} className="form-input" placeholder="https://… (falls back to site logo)" />
          </div>
          <div className="form-field">
            <label>Canonical URL</label>
            <input value={form.canonical} onChange={set("canonical")} className="form-input" placeholder="Leave empty to derive from the slug" />
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
              Override the canonical URL. Accepts a full URL or a path; empty derives <code>{contentPath}/{form.slug || "slug"}</code>.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Page Template</div>
          <select value={form.page_template_id} onChange={set("page_template_id")} className="form-input">
            {pageTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="card">
          <div className="card-title">Header</div>
          <select value={form.header_id} onChange={set("header_id")} className="form-input">
            <option value="">— None —</option>
            {headers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>

        <div className="card">
          <div className="card-title">Sections</div>
          {form.sections.map((s, i) => (
            <div key={i} className="section-item">
              <div className="section-item-header">
                <strong>🧩 {s.type_name || `Section ${i + 1}`}</strong>
                <button type="button" onClick={() => removeSection(i)} className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }}>Remove</button>
              </div>
              <textarea value={s.content || ""} onChange={e => { const sec = [...form.sections]; sec[i] = { ...sec[i], content: e.target.value }; setForm({ ...form, sections: sec }); }} rows={5} className="form-input" />
              {s.type_variables?.length > 0 && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 500 }}>Variables</div>
                  {s.type_variables.map(v => (
                    <div key={v.key} className="form-field" style={{ marginBottom: 6 }}>
                      <label style={{ fontSize: 13 }}>{v.label || v.key}</label>
                      <input className="form-input" style={{ fontSize: 13 }} value={(s.variables || {})[v.key] || ""}
                        onChange={e => { const sec = [...form.sections]; sec[i] = { ...sec[i], variables: { ...sec[i].variables, [v.key]: e.target.value } }; setForm({ ...form, sections: sec }); }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="add-section-row">
            <select className="form-input" value="" onChange={e => { if (e.target.value) addSection(e.target.value); }}>
              <option value="" disabled>+ Add section…</option>
              {sectionTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Footer</div>
          <select value={form.footer_id} onChange={set("footer_id")} className="form-input">
            <option value="">— None —</option>
            {footers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

        <button type="submit" className="btn btn-primary">Save Page</button>
      </form>
    </>
  );
}
