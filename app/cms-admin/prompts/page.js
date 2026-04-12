"use client";
import React, { useEffect, useState } from "react";

const TYPE_LABELS = { system: "System", object_type: "Object Type", object: "Object" };
const TYPE_BADGE = { system: "#6366f1", object_type: "#0891b2", object: "#65a30d" };

export default function PromptsPage() {
  const [prompts, setPrompts] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [versions, setVersions] = useState([]);

  useEffect(() => { fetch("/api/prompts/all").then(r => r.json()).then(setPrompts); }, []);

  async function toggle(scopeKey) {
    if (expanded === scopeKey) { setExpanded(null); return; }
    setExpanded(scopeKey);
    const res = await fetch(`/api/prompts?scope_key=${encodeURIComponent(scopeKey)}`);
    const data = await res.json();
    setVersions(data.versions || []);
  }

  async function activate(scopeKey, version) {
    await fetch("/api/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope_key: scopeKey, version }),
    });
    // Refresh
    const [allRes, verRes] = await Promise.all([
      fetch("/api/prompts/all").then(r => r.json()),
      fetch(`/api/prompts?scope_key=${encodeURIComponent(scopeKey)}`).then(r => r.json()),
    ]);
    setPrompts(allRes);
    setVersions(verRes.versions || []);
  }

  return (
    <>
      <div className="page-header"><h1>Prompts</h1></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Scope</th><th>Key</th><th>Active</th><th>Versions</th><th>Preview</th></tr>
          </thead>
          <tbody>
            {prompts.map(p => (
              <React.Fragment key={p.scope_key}>
                <tr onClick={() => toggle(p.scope_key)} style={{ cursor: "pointer" }}>
                  <td>
                    <span style={{ background: TYPE_BADGE[p.scope_type], color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {TYPE_LABELS[p.scope_type]}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500, fontFamily: "monospace", fontSize: 13 }}>{p.scope_key}</td>
                  <td>v{p.active_version}</td>
                  <td>{p.version_count}</td>
                  <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: "var(--text-muted)" }}>
                    {p.active_content?.slice(0, 80) || "—"}
                  </td>
                </tr>
                {expanded === p.scope_key && (
                  <tr key={`${p.scope_key}-exp`}>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <div className="prompt-versions">
                        {versions.map(v => (
                          <div key={v.version} className={`prompt-version ${v.is_active ? "prompt-version-active" : ""}`}>
                            <div className="prompt-version-header">
                              <span style={{ fontWeight: 600 }}>v{v.version}</span>
                              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(v.created_at).toLocaleString()}</span>
                              {v.is_active
                                ? <span style={{ fontSize: 11, fontWeight: 600, color: "var(--primary)" }}>● Active</span>
                                : <button onClick={() => activate(p.scope_key, v.version)} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>Activate</button>
                              }
                            </div>
                            <pre className="prompt-version-content">{v.content || "(empty)"}</pre>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {!prompts.length && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No prompts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
