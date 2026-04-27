"use client";
import { useEffect, useState } from "react";
import { substituteVars } from "@/lib/template";
import PromptEditor from "./PromptEditor";
import SafeHtml from "@/app/components/SafeHtml";

export default function TemplateManager({ apiPath, contentField = "content", title = "Editor", renderPreview, objectType, showVariables }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ name: "", [contentField]: "", variables: [] });
  const [prompt, setPrompt] = useState("");
  const [imageData, setImageData] = useState(null); // { base64, mimeType }
  const [llmProvider, setLlmProvider] = useState("gemini");
  const [generating, setGenerating] = useState(false);
  const [config, setConfig] = useState({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [propagateDialog, setPropagateDialog] = useState(null); // { count, pages }
  const [propagating, setPropagating] = useState(false);

  useEffect(() => {
    fetch("/api/site-config").then(r => r.json()).then(setConfig);
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    const data = await (await fetch(apiPath)).json();
    setItems(data);
    if (data.length && !selectedId) selectItem(data[0]);
    setLoading(false);
  }

  function selectItem(item) {
    setSelectedId(item.id);
    const vars = typeof item.variables === "string" ? JSON.parse(item.variables || "[]") : (item.variables || []);
    setForm({ name: item.name, [contentField]: item[contentField] || "", variables: vars });
    setPrompt("");
    setSaved(false);
  }

  function handleSelect(e) {
    const item = items.find(i => i.id === Number(e.target.value));
    if (item) selectItem(item);
  }

  function addNew() {
    setSelectedId("new");
    setForm({ name: "", [contentField]: "", variables: [] });
    setPrompt("");
    setSaved(false);
  }

  async function saveName() {
    if (selectedId === "new" || !selectedId || saving) return;
    setSaving(true); setError(null);
    const res = await fetch(`${apiPath}/${selectedId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) { setError("Save failed"); return; }
    setItems(prev => prev.map(i => i.id === selectedId ? { ...i, name: form.name } : i));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function save() {
    if (saving) return;
    setSaving(true); setError(null);
    const url = selectedId === "new" ? apiPath : `${apiPath}/${selectedId}`;
    const method = selectedId === "new" ? "POST" : "PUT";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) { setSaving(false); setError("Save failed"); return; }
    if (selectedId === "new") {
      const { id } = await res.json();
      const data = await (await fetch(apiPath)).json();
      setItems(data);
      const created = data.find(i => i.id === id);
      if (created) selectItem(created);
    } else {
      setItems(prev => prev.map(i => i.id === selectedId ? { ...i, ...form } : i));
      // Check usage for section types
      if (showVariables && selectedId !== "new") {
        const usage = await (await fetch(`${apiPath}/${selectedId}/usage`)).json();
        if (usage.count > 0) { setSaving(false); setPropagateDialog(usage); return; }
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function propagate(action) {
    setPropagating(true);
    await fetch(`${apiPath}/${selectedId}/propagate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setPropagating(false);
    setPropagateDialog(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function remove() {
    if (!confirm("Delete this item?")) return;
    await fetch(`${apiPath}/${selectedId}`, { method: "DELETE" });
    const data = await (await fetch(apiPath)).json();
    setItems(data);
    if (data.length) selectItem(data[0]);
    else { setSelectedId(null); setForm({ name: "", [contentField]: "" }); }
  }

  function handleImage(e) {
    const file = e.target.files[0];
    if (!file) { setImageData(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      setImageData({ base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: llmProvider,
          prompt: form.variables?.length
            ? `${prompt}\n\nAvailable template variables (use {{key}} syntax):\n${form.variables.map(v => `- {{${v.key}}}${v.label ? ` — ${v.label}` : ""}`).join("\n")}`
            : prompt,
          currentHtml: form[contentField],
          objectType: objectType || null,
          objectKey: objectType && selectedId && selectedId !== "new" ? `${objectType}:${selectedId}` : null,
          imageData: imageData || undefined,
        }),
      });
      const data = await res.json();
      console.log("[Generate response]", data);
      if (data.error) { alert(data.error); }
      else { setForm(f => ({ ...f, [contentField]: data.html })); }
    } catch (e) { alert("Generation failed: " + e.message); }
    setGenerating(false);
  }

  const objectKey = selectedId && selectedId !== "new" ? `${objectType}:${selectedId}` : null;

  return (
    <>
      {/* Row 1: title + dropdown + Add New */}
      <div className="page-header">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <h1>{title}</h1>
          <select value={selectedId === "new" ? "__new__" : selectedId || ""} onChange={handleSelect} className="form-input" style={{ width: 200 }}>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <button type="button" onClick={addNew} className="btn btn-primary btn-sm">+ Add New</button>
      </div>

      {/* Row 2: Name edit + Save name + Delete */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Name:</label>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="form-input" placeholder="Name" style={{ maxWidth: 260 }} required />
        <button type="button" onClick={saveName} className="btn btn-secondary btn-sm" disabled={saving}>Save</button>
        {selectedId && selectedId !== "new" && items.length > 1 && (
          <button type="button" onClick={remove} className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }}>Delete</button>
        )}
        {saved && <span className="toast-saved">✓ Saved</span>}
      </div>

      {/* Preview */}
      <div className="card">
        <div className="card-title">Preview</div>
        <div className="template-preview">
          {renderPreview
            ? renderPreview(substituteVars(form[contentField], config))
            : <SafeHtml html={substituteVars(form[contentField], config) || '<span style="color:var(--text-muted)">No content yet</span>'} />
          }
        </div>
      </div>

      {/* Page Variables (for section types) — directly below preview */}
      {showVariables && (
        <div className="card">
          <div className="card-title">Page Variables</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Define variables that will appear as input fields when this section is used in a page. Use <code>{"{{key}}"}</code> in the template above. Prompt supports <code>{"{{category}}"}</code> and other site variables.</p>
          {form.variables.map((v, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <input className="form-input" placeholder="key" value={v.key} style={{ width: 160, fontFamily: "monospace", fontSize: 13 }}
                onChange={e => { const vars = [...form.variables]; vars[i] = { ...vars[i], key: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() }; setForm({ ...form, variables: vars }); }} />
              <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                <span onClick={() => { const vars = [...form.variables]; vars[i] = { ...vars[i], type: "prompt" }; setForm({ ...form, variables: vars }); }}
                  style={{ padding: "2px 8px", cursor: "pointer", background: (v.type || "prompt") === "prompt" ? "var(--border)" : "#fff", color: "var(--text)" }}>Prompt</span>
                <span onClick={() => { const vars = [...form.variables]; vars[i] = { ...vars[i], type: "fixed" }; setForm({ ...form, variables: vars }); }}
                  style={{ padding: "2px 8px", cursor: "pointer", background: (v.type || "prompt") === "fixed" ? "var(--border)" : "#fff", color: "var(--text)" }}>Fixed</span>
              </div>
              <input className="form-input" placeholder={(v.type || "prompt") === "prompt" ? "Prompt (supports {{category}})" : "Label"} value={v.label} style={{ flex: 1, fontSize: 13 }}
                onChange={e => { const vars = [...form.variables]; vars[i] = { ...vars[i], label: e.target.value }; setForm({ ...form, variables: vars }); }} />
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }}
                onClick={() => setForm({ ...form, variables: form.variables.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, variables: [...form.variables, { key: "", label: "", type: "prompt" }] })}>+ Add Variable</button>
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={save} className="btn btn-primary btn-sm" disabled={saving}>Save</button>
            {saved && <span className="toast-saved">✓ Saved</span>}
          </div>
        </div>
      )}

      {/* Content Source group */}
      {showVariables && <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 28, marginBottom: 12, color: "var(--text-secondary)" }}>Content Source</h2>}

      {/* Editor grid */}
      <div className="template-editor-grid">
        <div className="card">
          <div className="card-title">Template Source</div>
          {!showVariables && <div className="config-ref">
            <strong>Variables:</strong>{" "}
            {Object.keys(config).map(k => <code key={k} className="var-tag">{`{{${k}}}`}</code>)}
          </div>}
          <textarea value={form[contentField]} onChange={e => setForm({ ...form, [contentField]: e.target.value })} rows={12} className="form-input" style={{ fontFamily: "monospace", fontSize: 13 }} />
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={save} className="btn btn-primary" disabled={saving}>Save</button>
            {saved && <span className="toast-saved">✓ Saved</span>}
            {error && <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>}
          </div>
        </div>
        <div className="card">
          <div className="card-title">AI Generate</div>
          <div className="llm-radios">
            {[["openai", "OpenAI"], ["claude", "Anthropic"], ["gemini", "Gemini"]].map(([val, label]) => (
              <label key={val} className="llm-radio">
                <input type="radio" name="llm" value={val} checked={llmProvider === val} onChange={() => setLlmProvider(val)} />
                {label}
              </label>
            ))}
          </div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={12} className="form-input" placeholder="Describe what you want to generate…" />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", fontSize: 12 }}>
              📎 {imageData ? "Image attached" : "Attach image"}
              <input type="file" accept="image/*" onChange={handleImage} hidden />
            </label>
            {imageData && <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => setImageData(null)}>✕</button>}
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={generate} className="btn btn-primary" disabled={generating || !prompt.trim()}>
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </div>

      {/* Prompt editors — part of Content Source group */}
      {objectType && (
        <div className="template-editor-grid" style={{ marginTop: 20 }}>
          <div className="card">
            <PromptEditor scopeType="object_type" scopeKey={objectType} label={`${title} Type Prompt`} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Applies to all {title.toLowerCase()} when generating.</p>
          </div>
          {objectKey && (
            <div className="card">
              <PromptEditor key={objectKey} scopeType="object" scopeKey={objectKey} label={`"${form.name || "This Item"}" Prompt`} />
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Applies only to this specific item.</p>
            </div>
          )}
        </div>
      )}

      {/* Propagation dialog */}
      {propagateDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 520, width: "100%", margin: 20 }}>
            <div className="card-title">Propagate Changes</div>
            <p style={{ fontSize: 14, marginBottom: 8 }}>
              <strong>{propagateDialog.count} page{propagateDialog.count !== 1 ? "s" : ""}</strong> use this section type.
            </p>
            <div style={{ maxHeight: 120, overflow: "auto", fontSize: 13, color: "var(--text-muted)", marginBottom: 16, padding: "6px 0" }}>
              {propagateDialog.pages.map(p => <div key={p.id}>{p.title} <span className={`badge badge-${p.status}`} style={{ fontSize: 10 }}>{p.status}</span></div>)}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Template changes are live automatically. Choose an additional action for page variables:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" disabled={propagating} onClick={() => propagate("template_only")}>
                Apply template change only
              </button>
              <button className="btn btn-secondary btn-sm" disabled={propagating} onClick={() => propagate("fill_fixed")}>
                Fill new/missing fixed variables
              </button>
              <button className="btn btn-secondary btn-sm" disabled={propagating} onClick={() => propagate("refresh_fixed")}>
                Refresh fixed variable defaults
              </button>
              <button className="btn btn-secondary btn-sm" disabled={propagating} onClick={() => propagate("generate_missing")}>
                Generate missing prompted variables
              </button>
              <button className="btn btn-secondary btn-sm" disabled={propagating} onClick={() => propagate("refresh_ai")}>
                Refresh all AI-generated variables
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>✏️ Manual values are never overwritten.</p>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPropagateDialog(null)} disabled={propagating}>
                {propagating ? "Working…" : "Skip / Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
