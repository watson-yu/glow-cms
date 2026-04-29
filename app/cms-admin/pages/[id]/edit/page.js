"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { substituteVars } from "@/lib/template";

export default function EditPage() {
  const { id } = useParams();
  const router = useRouter();
  const isNew = id === "new";
  const [form, setForm] = useState({ title: "", slug: "", header_id: "", footer_id: "", page_template_id: "", status: "draft", category_id: "", sections: [] });
  const [saving, setSaving] = useState(false);
  const [headers, setHeaders] = useState([]);
  const [footers, setFooters] = useState([]);
  const [pageTemplates, setPageTemplates] = useState([]);
  const [sectionTypes, setSectionTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contentPath, setContentPath] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOptions = Promise.all([
      fetch("/api/headers").then(r => r.json()),
      fetch("/api/footers").then(r => r.json()),
      fetch("/api/page-templates").then(r => r.json()),
      fetch("/api/section-types").then(r => r.json()),
      fetch("/api/site-config").then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
    ]).then(([h, f, pt, st, c, cats]) => {
      setHeaders(h); setFooters(f); setPageTemplates(pt); setSectionTypes(st); setCategories(cats);
      const cp = c.content_path || "";
      setContentPath(!cp || cp === "/" ? "" : cp.startsWith("/") ? cp : `/${cp}`);
      if (isNew) {
        setForm(prev => ({ ...prev, header_id: h[0]?.id || "", footer_id: f[0]?.id || "", page_template_id: pt[0]?.id || "" }));
        setLoading(false);
      }
    });
    if (!isNew) fetch(`/api/pages/${id}`).then(r => r.json()).then(d => {
      setForm({
        ...d, header_id: d.header_id || "", footer_id: d.footer_id || "", page_template_id: d.page_template_id || "", category_id: d.category_id || "",
        sections: (d.sections || []).map(s => ({
          ...s,
          variables: typeof s.variables === "string" ? JSON.parse(s.variables || "{}") : (s.variables || {}),
          variable_origins: typeof s.variable_origins === "string" ? JSON.parse(s.variable_origins || "{}") : (s.variable_origins || {}),
          type_variables: typeof s.type_variables === "string" ? JSON.parse(s.type_variables || "[]") : (s.type_variables || []),
        }))
      });
      setLoading(false);
    });
  }, [id, isNew]);

  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value });

  const autoFilled = useRef(false);
  useEffect(() => {
    if (autoFilled.current || !form.sections.length || !categories.length) return;
    autoFilled.current = true;
    const allCats = categories.flatMap(p => [p, ...p.children]);
    const cat = allCats.find(c => c.id === Number(form.category_id));
    const ctx = { category: cat?.name || "", slug: form.slug || "", title: form.title || "" };

    let updated = false;
    const newSections = form.sections.map(s => {
      if (!s.type_variables?.length) return s;
      const vars = { ...(s.variables || {}) };
      const origins = { ...(s.variable_origins || {}) };
      s.type_variables.forEach(v => {
        if (!vars[v.key] && (v.type || "prompt") === "fixed" && v.label && (typeof origins[v.key] === "object" ? origins[v.key]?.source : origins[v.key]) !== "manual") {
          vars[v.key] = substituteVars(v.label, ctx);
          origins[v.key] = { source: "ai_generated", generated_at: new Date().toISOString() };
          updated = true;
        }
      });
      return { ...s, variables: vars, variable_origins: origins };
    });
    if (updated) setForm(prev => ({ ...prev, sections: newSections }));
  }, [form.sections, categories]);

  const [generating, setGenerating] = useState({});

  function addSection(typeId) {
    const type = sectionTypes.find(t => t.id === Number(typeId));
    if (!type) return;
    const typVars = typeof type.variables === "string" ? JSON.parse(type.variables || "[]") : (type.variables || []);
    const hasPrompts = typVars.some(v => (v.type || "prompt") === "prompt" && v.label);
    const newIdx = form.sections.length;
    const newSection = { section_type_id: type.id, type_name: type.name, content: type.default_content || "", type_variables: typVars, variables: {}, variable_origins: {} };
    setForm(prev => ({ ...prev, sections: [...prev.sections, newSection] }));
    if (hasPrompts) autoGenerate(newIdx, newSection);
  }

  function removeSection(i) {
    setForm({ ...form, sections: form.sections.filter((_, j) => j !== i) });
  }

  function getPageContext() {
    const allCats = categories.flatMap(p => [p, ...p.children]);
    const cat = allCats.find(c => c.id === Number(form.category_id));
    return { category: cat?.name || "", slug: form.slug || "", title: form.title || "" };
  }

  async function autoGenerate(sectionIdx, sectionData) {
    const s = sectionData || form.sections[sectionIdx];
    if (!s?.type_variables?.length) return;
    const ctx = getPageContext();
    const origins = s.variable_origins || {};
    const toGenerate = s.type_variables.filter(v =>
      (v.type || "prompt") === "prompt" && v.label && (typeof origins[v.key] === "object" ? origins[v.key]?.source : origins[v.key]) !== "manual"
    );
    if (!toGenerate.length) return;

    setGenerating(g => ({ ...g, [sectionIdx]: true }));
    const prompt = toGenerate.map(v => `- ${v.key}: ${substituteVars(v.label, ctx)}`).join("\n");
    const res = await fetch("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "gemini",
        prompt: `Generate short text values for the following variables. Return ONLY a JSON object with the keys and generated string values, no markdown fences.\n\n${prompt}`,
        currentHtml: "",
        objectType: null, objectKey: null,
      }),
    });
    const data = await res.json();
    setGenerating(g => ({ ...g, [sectionIdx]: false }));
    if (data.error) return;
    try {
      const clean = data.html.replace(/```json?\n?|\n?```/g, "").trim();
      const values = JSON.parse(clean);
      setForm(prev => {
        const sec = [...prev.sections];
        const newOrigins = { ...sec[sectionIdx].variable_origins };
        for (const k of Object.keys(values)) newOrigins[k] = { source: "ai_generated", generated_at: new Date().toISOString() };
        sec[sectionIdx] = { ...sec[sectionIdx], variables: { ...sec[sectionIdx].variables, ...values }, variable_origins: newOrigins };
        return { ...prev, sections: sec };
      });
    } catch (e) { /* ignore parse errors */ }
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = isNew ? "/api/pages" : `/api/pages/${id}`;
      const res = await fetch(url, { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Save failed"); setSaving(false); return; }
      router.push("/cms-admin");
    } catch { alert("Save failed"); setSaving(false); }
  }

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  return (
    <>
      <Link href="/cms-admin" className="back-link">← Back to Pages</Link>
      <form onSubmit={save}>
        <div className="editor-layout">
          {/* Left: main content */}
          <div className="editor-main">
            <input value={form.title} onChange={set("title")} required className="form-input editor-title" placeholder="Page title" />

            <div className="card">
              <div className="card-title">Sections</div>
              {form.sections.map((s, i) => (
                <div key={i} className="section-item">
                  <div className="section-item-header">
                    <strong>🧩 {s.type_name || `Section ${i + 1}`}</strong>
                    <button type="button" onClick={() => removeSection(i)} className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }}>Remove</button>
                  </div>
                  {s.type_variables?.length > 0 && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 500 }}>Variables</div>
                      {s.type_variables.map(v => {
                        const allCats = categories.flatMap(p => [p, ...p.children]);
                        const cat = allCats.find(c => c.id === Number(form.category_id));
                        const ctx = { category: cat?.name || "", slug: form.slug || "", title: form.title || "" };
                        const origin = (s.variable_origins || {})[v.key];
                        const originSource = typeof origin === "object" ? origin?.source : origin;
                        const badge = originSource === "manual" ? "✏️" : originSource === "ai_generated" ? "🤖" : null;
                        const tooltip = typeof origin === "object"
                          ? (origin.source === "ai_generated" ? `AI generated${origin.generated_at ? ` at ${new Date(origin.generated_at).toLocaleString()}` : ""}${origin.job_id ? ` (job #${origin.job_id})` : ""}` : `Manually edited${origin.edited_at ? ` at ${new Date(origin.edited_at).toLocaleString()}` : ""}`)
                          : (origin || "");
                        return (
                        <div key={v.key} style={{ display: "grid", gridTemplateColumns: "180px 1fr", alignItems: "center", gap: 8, paddingBlock: 6, borderBottom: "1px solid var(--border)" }}>
                          <label style={{ fontSize: 13 }}>{v.key} {badge && <span title={tooltip} style={{ fontSize: 11, cursor: "help" }}>{badge}</span>}</label>
                          <input className="form-input" style={{ fontSize: 13 }} value={(s.variables || {})[v.key] || ""} placeholder={v.type === "fixed" && v.label ? substituteVars(v.label, ctx) : ""}
                            onChange={e => { const sec = [...form.sections]; sec[i] = { ...sec[i], variables: { ...sec[i].variables, [v.key]: e.target.value }, variable_origins: { ...sec[i].variable_origins, [v.key]: { source: "manual", edited_at: new Date().toISOString() } } }; setForm({ ...form, sections: sec }); }} />
                        </div>
                        );
                      })}
                      <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => autoGenerate(i)} disabled={generating[i]}>
                        {generating[i] ? "⏳ Generating…" : "🤖 Re-generate"}
                      </button>
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
          </div>

          {/* Right: sidebar */}
          <div className="editor-sidebar">
            <div className="card">
              <div style={{ marginBottom: 8 }}><span className={`badge badge-${form.status}`}>{form.status.replace(/_/g, " ")}</span></div>
              {(form.status === "draft" || form.status === "ready_for_review") && (
                <>
                  <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={saving} onClick={() => { setForm(f => ({ ...f, status: "published" })); setTimeout(() => document.querySelector("form")?.requestSubmit(), 0); }}>
                    {saving ? "Publishing…" : "Publish"}
                  </button>
                  <button type="submit" className="btn btn-secondary btn-sm" style={{ width: "100%", marginTop: 8 }} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
                </>
              )}
              {form.status === "published" && !isNew && (
                <>
                  <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={saving} onClick={async () => {
                    setSaving(true);
                    try {
                      const res = await fetch(`/api/pages/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
                      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Re-publish failed"); }
                    } catch { alert("Re-publish failed"); }
                    setSaving(false);
                  }}>{saving ? "Saving…" : "Re-publish Snapshot"}</button>
                  <button type="submit" className="btn btn-secondary btn-sm" style={{ width: "100%", marginTop: 8 }} disabled={saving}>Save Changes</button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 4 }} disabled={saving} onClick={() => { setForm(f => ({ ...f, status: "draft" })); setTimeout(() => document.querySelector("form")?.requestSubmit(), 0); }}>Unpublish</button>
                </>
              )}
              {form.status === "generating" && (
                <>
                  <button type="submit" className="btn btn-secondary btn-sm" style={{ width: "100%" }} disabled>Generation in progress…</button>
                </>
              )}
              {form.status === "generation_failed" && (
                <>
                  <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={saving} onClick={async () => {
                    setSaving(true);
                    setForm(f => ({ ...f, status: "generating" }));
                    await fetch(`/api/pages/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, status: "generating" }) });
                    await fetch(`/api/pages/${id}/generate-variables`, { method: "POST" });
                    const d = await (await fetch(`/api/pages/${id}`)).json();
                    setForm(f => ({ ...f, status: d.status || "generation_failed" }));
                    setSaving(false);
                  }}>{saving ? "Retrying…" : "Retry Generation"}</button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8 }} disabled={saving} onClick={() => { setForm(f => ({ ...f, status: "draft" })); setTimeout(() => document.querySelector("form")?.requestSubmit(), 0); }}>Save as Draft</button>
                </>
              )}
              {isNew && (
                <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={saving}>{saving ? "Creating…" : "Create Page"}</button>
              )}
              {form.slug && (
                <a href={`/preview/${form.slug}`} target="_blank" className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8, textAlign: "center" }}>Preview ↗</a>
              )}
            </div>
            <div className="card">
              <div className="form-field"><label>Slug</label><input value={form.slug} onChange={set("slug")} required className="form-input" />
                {form.slug && <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>{contentPath}/{form.slug}</div>}
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
              <div className="form-field">
                <label>Page Template</label>
                <select value={form.page_template_id} onChange={set("page_template_id")} className="form-input">
                  {pageTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Header</label>
                <select value={form.header_id} onChange={set("header_id")} className="form-input">
                  <option value="">— None —</option>
                  {headers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Footer</label>
                <select value={form.footer_id} onChange={set("footer_id")} className="form-input">
                  <option value="">— None —</option>
                  {footers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
