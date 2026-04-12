"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function EditPage() {
  const { id } = useParams();
  const router = useRouter();
  const isNew = id === "new";
  const [form, setForm] = useState({ title: "", slug: "", header_id: "", footer_id: "", page_template_id: "", status: "draft", sections: [] });
  const [headers, setHeaders] = useState([]);
  const [footers, setFooters] = useState([]);
  const [pageTemplates, setPageTemplates] = useState([]);
  const [sectionTypes, setSectionTypes] = useState([]);
  const [contentPath, setContentPath] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/headers").then(r => r.json()),
      fetch("/api/footers").then(r => r.json()),
      fetch("/api/page-templates").then(r => r.json()),
      fetch("/api/section-types").then(r => r.json()),
      fetch("/api/site-config").then(r => r.json()),
    ]).then(([h, f, pt, st, c]) => {
      setHeaders(h);
      setFooters(f);
      setPageTemplates(pt);
      setSectionTypes(st);
      const cp = c.content_path || "";
      setContentPath(!cp || cp === "/" ? "" : cp.startsWith("/") ? cp : `/${cp}`);
      if (isNew) {
        setForm(prev => ({ ...prev, header_id: h[0]?.id || "", footer_id: f[0]?.id || "", page_template_id: pt[0]?.id || "" }));
      }
    });
    if (!isNew) fetch(`/api/pages/${id}`).then(r => r.json()).then(d => setForm({
      ...d, header_id: d.header_id || "", footer_id: d.footer_id || "", page_template_id: d.page_template_id || "", sections: d.sections || []
    }));
  }, [id, isNew]);

  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value });

  function addSection(typeId) {
    const type = sectionTypes.find(t => t.id === Number(typeId));
    if (!type) return;
    setForm({ ...form, sections: [...form.sections, { section_type_id: type.id, type_name: type.name, content: type.default_content || "" }] });
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
            </div>
          ))}
          <div className="add-section-row">
            <select id="addType" className="form-input" defaultValue="">
              <option value="" disabled>Select section type…</option>
              {sectionTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const sel = document.getElementById("addType"); if (sel.value) { addSection(sel.value); sel.value = ""; } }}>+ Add</button>
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
