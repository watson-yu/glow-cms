"use client";
import { useState } from "react";

export default function DbSetup() {
  const [form, setForm] = useState({ host: "", user: "root", password: "", database: "glow_cms", port: "3306" });
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setTesting(true);
    setError("");
    try {
      const res = await fetch("/api/db-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      window.location.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="db-setup-overlay">
      <div className="db-setup-card">
        <div className="db-setup-logo">✦ Glow CMS</div>
        <h2>Database Setup</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
          Enter your MySQL connection details to get started.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Host</label>
            <input className="form-input" value={form.host} onChange={set("host")} placeholder="localhost or db.example.com" required />
          </div>
          <div className="form-field">
            <label>Port</label>
            <input className="form-input" value={form.port} onChange={set("port")} placeholder="3306" />
          </div>
          <div className="form-field">
            <label>Database Name</label>
            <input className="form-input" value={form.database} onChange={set("database")} placeholder="glow_cms" required />
          </div>
          <div className="form-field">
            <label>Username</label>
            <input className="form-input" value={form.user} onChange={set("user")} placeholder="root" required />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input className="form-input" type="password" value={form.password} onChange={set("password")} placeholder="••••••••" />
          </div>
          {error && <div className="db-setup-error">{error}</div>}
          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={testing}>
            {testing ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
