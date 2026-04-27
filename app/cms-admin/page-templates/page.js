"use client";
import { useEffect, useState } from "react";
import TemplateManager from "@/app/cms-admin/components/TemplateManager";
import { substituteVars } from "@/lib/template";
import SafeHtml from "@/app/components/SafeHtml";

export default function PageTemplatesPage() {
  const [headers, setHeaders] = useState([]);
  const [footers, setFooters] = useState([]);
  const [sectionTypes, setSectionTypes] = useState([]);
  const [config, setConfig] = useState({});

  useEffect(() => {
    fetch("/api/site-config").then(r => r.json()).then(setConfig);
    fetch("/api/headers").then(r => r.json()).then(setHeaders);
    fetch("/api/footers").then(r => r.json()).then(setFooters);
    fetch("/api/section-types").then(r => r.json()).then(setSectionTypes);
  }, []);

  function renderPreview(templateHtml, { form }) {
    const hdr = headers.find(h => h.id === form.header_id);
    const ftr = footers.find(f => f.id === form.footer_id);
    const header = hdr ? substituteVars(hdr.content, config, { stripUnresolved: true }) : "";
    const footer = ftr ? substituteVars(ftr.content, config, { stripUnresolved: true }) : "";

    // Render blueprint sections inside {{content}}
    let sectionsHtml = "";
    if (form.sections?.length) {
      sectionsHtml = form.sections.map(s => {
        const st = sectionTypes.find(t => t.id === s.section_type_id);
        return st?.default_content
          ? substituteVars(st.default_content, config, { stripUnresolved: true })
          : `<div style="border:2px dashed var(--border);padding:16px;text-align:center;color:var(--text-muted);border-radius:8px;margin:8px 0">[${st?.name || 'Section'}]</div>`;
      }).join("\n");
    }

    const placeholder = sectionsHtml || '<div style="border:2px dashed var(--border);padding:24px;text-align:center;color:var(--text-muted);border-radius:8px;margin:16px 0">Page sections go here</div>';
    let body;
    if (!templateHtml) {
      body = '<span style="color:var(--text-muted)">No content yet</span>';
    } else if (templateHtml.includes("{{content}}")) {
      body = templateHtml.replace("{{content}}", placeholder);
    } else {
      body = templateHtml + placeholder;
    }
    return (
      <div style={{ minHeight: 60 }}>
        {header && <SafeHtml html={header} />}
        <SafeHtml html={body} />
        {footer && <SafeHtml html={footer} />}
      </div>
    );
  }

  function renderExtra({ form, setForm }) {
    return (
      <>
        {/* Header/Footer Selectors */}
        <div className="card">
          <div className="card-title">Blueprint Defaults</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div className="form-field" style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, display: "block" }}>Default Header</label>
              <select className="form-input" value={form.header_id || ""} onChange={e => setForm({ ...form, header_id: e.target.value ? Number(e.target.value) : null })} aria-label="Default header">
                <option value="">None</option>
                {headers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, display: "block" }}>Default Footer</label>
              <select className="form-input" value={form.footer_id || ""} onChange={e => setForm({ ...form, footer_id: e.target.value ? Number(e.target.value) : null })} aria-label="Default footer">
                <option value="">None</option>
                {footers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Blueprint Sections */}
        <div className="card">
          <div className="card-title">Blueprint Sections</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Section types that will be auto-created when a page uses this template.</p>
          {(form.sections || []).map((s, i) => {
            const st = sectionTypes.find(t => t.id === s.section_type_id);
            return (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, flex: 1 }}>{st?.name || `Section Type #${s.section_type_id}`}</span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => {
                  const arr = [...(form.sections || [])];
                  [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                  setForm({ ...form, sections: arr });
                }} aria-label="Move up">↑</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={i === (form.sections || []).length - 1} onClick={() => {
                  const arr = [...(form.sections || [])];
                  [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                  setForm({ ...form, sections: arr });
                }} aria-label="Move down">↓</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => {
                  setForm({ ...form, sections: (form.sections || []).filter((_, j) => j !== i) });
                }} aria-label="Remove section">✕</button>
              </div>
            );
          })}
          <select className="form-input" style={{ width: "auto", marginTop: 8 }} value="" onChange={e => {
            if (!e.target.value) return;
            const sections = [...(form.sections || []), { section_type_id: Number(e.target.value), sort_order: (form.sections || []).length }];
            setForm({ ...form, sections });
            e.target.value = "";
          }} aria-label="Add section type">
            <option value="">+ Add Section Type</option>
            {sectionTypes.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>
      </>
    );
  }

  return <TemplateManager apiPath="/api/page-templates" title="Page Templates" objectType="page_template" renderPreview={(html, extra) => renderPreview(html, extra)} renderExtra={renderExtra} />;
}
