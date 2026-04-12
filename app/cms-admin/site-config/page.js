"use client";
import { useEffect, useState, useRef } from "react";

const fields = [
  { key: "site_title", label: "Site Title" },
  { key: "copyright_text", label: "Copyright Text" },
  { key: "privacy_link", label: "Privacy Policy Link" },
  { key: "terms_link", label: "Terms of Service Link" },
];

export default function SiteConfigPage() {
  const [config, setConfig] = useState({});
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => { fetch("/api/site-config").then(r => r.json()).then(setConfig); }, []);

  async function save(e) {
    e.preventDefault();
    await fetch("/api/site-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function uploadLogo(file) {
    setUploading(true);
    // Remove old logo from S3 if exists
    if (config.logo_url) {
      await fetch("/api/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: config.logo_url }) });
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const { url } = await res.json();
    const updated = { ...config, logo_url: url };
    setConfig(updated);
    await fetch("/api/site-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logo_url: url }) });
    setUploading(false);
  }

  async function removeLogo() {
    if (!confirm("Remove logo?")) return;
    if (config.logo_url) {
      await fetch("/api/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: config.logo_url }) });
    }
    const updated = { ...config, logo_url: "" };
    setConfig(updated);
    await fetch("/api/site-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logo_url: "" }) });
  }

  return (
    <>
      <div className="page-header">
        <h1>Site Config</h1>
        <div>
          {saved && <span className="toast-saved">✓ Saved</span>}
          <button type="submit" form="site-config-form" className="btn btn-primary">Save Config</button>
        </div>
      </div>
      <form id="site-config-form" onSubmit={save} className="system-config-grid">
        <div className="card">
          <div className="card-title">Site Logo</div>
          {config.logo_url ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
              <img src={config.logo_url} alt="Logo" style={{ maxHeight: 80, maxWidth: 200, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading…" : "Replace"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={removeLogo}>Remove</button>
              </div>
            </div>
          ) : (
            <div>
              <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? "Uploading…" : "Upload Logo"}
              </button>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>Recommended: PNG or SVG, max 200px height</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { if (e.target.files[0]) uploadLogo(e.target.files[0]); e.target.value = ""; }} />
        </div>

        <div className="card">
          <div className="card-title">Content Path</div>
          <div className="form-field">
            <label>Public Pages Path Prefix</label>
            <input value={config.content_path || ""} onChange={e => setConfig({ ...config, content_path: e.target.value })} className="form-input" placeholder="/guides" />
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
              Leave empty or "/" for root. E.g. "/guides" → pages at /guides/slug. Preview always at /preview/slug.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-title">General</div>
          {fields.map(f => (
            <div key={f.key} className="form-field">
              <label>{f.label}</label>
              <input value={config[f.key] || ""} onChange={e => setConfig({ ...config, [f.key]: e.target.value })} className="form-input" />
            </div>
          ))}
        </div>
      </form>
    </>
  );
}
