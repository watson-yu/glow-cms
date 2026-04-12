"use client";
import { useEffect, useState } from "react";

export default function PromptEditor({ scopeType, scopeKey, label }) {
  const [active, setActive] = useState(null);
  const [versions, setVersions] = useState([]);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, [scopeKey]);

  async function load() {
    const res = await fetch(`/api/prompts?scope_key=${encodeURIComponent(scopeKey)}`);
    const data = await res.json();
    setActive(data.active);
    setVersions(data.versions || []);
    setDraft(data.active?.content || "");
  }

  async function saveNew() {
    await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope_type: scopeType, scope_key: scopeKey, content: draft }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  async function activateVersion(version) {
    await fetch("/api/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope_key: scopeKey, version }),
    });
    load();
  }

  const changed = draft !== (active?.content || "");

  return (
    <div>
      {label && <div className="card-title" style={{ marginBottom: 12 }}>{label}</div>}
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} className="form-input" style={{ fontFamily: "monospace", fontSize: 13 }} placeholder="Enter prompt..." />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button type="button" onClick={saveNew} className="btn btn-primary btn-sm" disabled={!changed}>Save as v{(active?.version || 0) + 1}</button>
        {versions.length > 1 && (
          <select
            value={active?.version || ""}
            onChange={e => activateVersion(Number(e.target.value))}
            className="form-input"
            style={{ width: "auto", fontSize: 13 }}
          >
            {versions.map(v => (
              <option key={v.version} value={v.version}>
                v{v.version}{v.is_active ? " (active)" : ""}
              </option>
            ))}
          </select>
        )}
        {active && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>v{active.version} active</span>}
        {saved && <span className="toast-saved">✓ Saved</span>}
      </div>
    </div>
  );
}
