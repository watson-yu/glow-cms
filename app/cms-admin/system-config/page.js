"use client";
import { useEffect, useState } from "react";

import PromptEditor from "@/app/cms-admin/components/PromptEditor";

const sections = [
  { title: "AWS S3 Storage", desc: "Configure S3 for image uploads.", fields: [
    { key: "aws_region", label: "AWS Region", placeholder: "us-west-2" },
    { key: "s3_bucket_name", label: "S3 Bucket Name", placeholder: "my-bucket" },
    { key: "aws_access_key", label: "Access Key ID", secret: true },
    { key: "aws_secret_key", label: "Secret Access Key", secret: true },
  ]},
  { title: "MySQL Database", desc: "Database connection settings.", fields: [
    { key: "db_host", label: "Host", placeholder: "localhost" },
    { key: "db_port", label: "Port", placeholder: "3306" },
    { key: "db_name", label: "Database Name" },
    { key: "db_user", label: "Username" },
    { key: "db_password", label: "Password", secret: true },
  ]},
  { title: "Google OAuth", desc: "Google sign-in credentials.", fields: [
    { key: "google_client_id", label: "Client ID" },
    { key: "google_client_secret", label: "Client Secret", secret: true },
  ]},
  { title: "Login Restrictions", desc: "Allowed emails and domains (one per line). e.g. watson@google.com or @glow360.com. Leave empty to allow all.", fields: [
    { key: "allowed_logins", label: "Allowed Logins", multiline: true },
  ]},
  { title: "LLM API Keys", desc: "API keys for AI language models.", fields: [
    { key: "openai_api_key", label: "OpenAI", secret: true },
    { key: "claude_api_key", label: "Claude (Anthropic)", secret: true },
    { key: "gemini_api_key", label: "Gemini (Google)", secret: true },
  ]},
];

export default function SystemConfigPage() {
  const [config, setConfig] = useState({});
  const [edits, setEdits] = useState({});
  const [editing, setEditing] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetch("/api/system-config").then(r => r.json()).then(setConfig); }, []);

  function toggleEdit(key) {
    setEditing(prev => ({ ...prev, [key]: !prev[key] }));
    if (editing[key]) {
      const { [key]: _, ...rest } = edits;
      setEdits(rest);
    }
  }

  function displayValue(key, field) {
    if (editing[key] !== undefined && editing[key]) return undefined;
    const val = config[key];
    if (!val) return "";
    if (field.secret && typeof val === "object") return val.masked;
    return val;
  }

  async function save(e) {
    e.preventDefault();
    const payload = {};
    for (const sec of sections) {
      for (const f of sec.fields) {
        if (f.secret && !editing[f.key]) continue;
        if (f.secret && editing[f.key]) {
          payload[f.key] = edits[f.key] ?? "";
        } else if (edits[f.key] !== undefined) {
          payload[f.key] = edits[f.key];
        }
      }
    }
    // Include non-secret fields that were changed
    for (const sec of sections) {
      for (const f of sec.fields) {
        if (!f.secret && edits[f.key] !== undefined) {
          payload[f.key] = edits[f.key];
        }
      }
    }
    if (!Object.keys(payload).length) return;
    await fetch("/api/system-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setEditing({});
    setEdits({});
    const r = await fetch("/api/system-config");
    setConfig(await r.json());
  }

  return (
    <>
      <div className="page-header">
        <h1>System Config</h1>
        <div>
          {saved && <span className="toast-saved">✓ Saved</span>}
          <button type="submit" form="system-config-form" className="btn btn-primary">Save</button>
        </div>
      </div>
      <form id="system-config-form" onSubmit={save} className="system-config-grid">
        {sections.map(sec => (
          <div className="card" key={sec.title}>
            <div className="card-title">{sec.title}</div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{sec.desc}</p>
            {sec.fields.map(f => (
              <div key={f.key} className="form-field">
                <label>{f.label}</label>
                {f.secret ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    {editing[f.key] ? (
                      <input
                        type="text"
                        value={edits[f.key] ?? ""}
                        onChange={e => setEdits({ ...edits, [f.key]: e.target.value })}
                        className="form-input"
                        placeholder="Enter new value"
                        autoFocus
                      />
                    ) : (
                      <input
                        type="text"
                        value={displayValue(f.key, f)}
                        className="form-input"
                        disabled
                        style={{ background: "var(--bg)", color: "var(--text-muted)" }}
                      />
                    )}
                    <button type="button" onClick={() => toggleEdit(f.key)} className="btn btn-secondary btn-sm" style={{ whiteSpace: "nowrap" }}>
                      {editing[f.key] ? "Cancel" : "Change"}
                    </button>
                  </div>
                ) : f.multiline ? (
                  <textarea
                    value={edits[f.key] ?? (typeof config[f.key] === "string" ? config[f.key] : "") ?? ""}
                    onChange={e => setEdits({ ...edits, [f.key]: e.target.value })}
                    className="form-input"
                    rows={4}
                    placeholder="one entry per line"
                    style={{ fontFamily: "monospace", fontSize: 13 }}
                  />
                ) : (
                  <input
                    value={edits[f.key] ?? (typeof config[f.key] === "string" ? config[f.key] : "") ?? ""}
                    onChange={e => setEdits({ ...edits, [f.key]: e.target.value })}
                    className="form-input"
                    placeholder={f.placeholder || ""}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </form>
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <PromptEditor scopeType="system" scopeKey="system" label="System Prompt (applied to all LLM generations)" />
      </div>
    </>
  );
}
