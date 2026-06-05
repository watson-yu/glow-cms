"use client";
import { useEffect, useState } from "react";

export default function PromptEditor({ scopeType, scopeKey, label, onContentChange }) {
  const [active, setActive] = useState(null);
  const [versions, setVersions] = useState([]);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  // Report the current draft up so parents can react to whether a prompt exists.
  useEffect(() => { onContentChange?.(scopeKey, draft); }, [draft, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/prompts?scope_key=${encodeURIComponent(scopeKey)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        setActive(data.active);
        setVersions(data.versions || []);
        setDraft(data.active?.content || "");
      })
      .catch(e => { if (e.name !== "AbortError") console.error(e); });
    return () => controller.abort();
  }, [scopeKey]);

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
  // Saving always appends after the highest existing version (server uses MAX+1),
  // so the label must reflect that — not active.version + 1, which would mislabel
  // (and look like an overwrite) when an older version is reactivated.
  const nextVersion = (versions.length ? Math.max(...versions.map(v => v.version)) : 0) + 1;

  return (
    <div>
      {label && <div className="card-title" style={{ marginBottom: 12 }}>{label}</div>}
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={12} className="form-input" style={{ fontFamily: "monospace", fontSize: 13 }} placeholder="Enter prompt..." />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button type="button" onClick={saveNew} className="btn btn-primary btn-sm" disabled={!changed}>Save as v{nextVersion}</button>
        {versions.length > 1 && (
          <select
            value={active?.version || ""}
            onChange={e => activateVersion(Number(e.target.value))}
            className="form-input"
            style={{ width: "auto", fontSize: 13 }}
            aria-label="Prompt version"
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
