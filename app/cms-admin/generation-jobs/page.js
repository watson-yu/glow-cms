"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function GenerationJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/generation-jobs").then(r => r.json()).then(data => { setJobs(data); setLoading(false); });
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const statusBadge = (s) => {
    const map = { pending: "draft", running: "generating", completed: "published", failed: "generation_failed" };
    return <span className={`badge badge-${map[s] || "draft"}`}>{s}</span>;
  };

  return (
    <>
      <div className="page-header"><h1>Generation Jobs</h1></div>
      <div className="table-wrap">
        <table aria-label="Generation jobs">
          <thead>
            <tr><th>Started</th><th>Page</th><th>Progress</th><th>Status</th><th>Error</th></tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id}>
                <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{new Date(j.created_at).toLocaleString()}</td>
                <td>{j.page_id === 0 ? <em style={{ color: "var(--text-muted)" }}>Batch</em> : j.page_title ? <Link href={`/cms-admin/pages/${j.page_id}/edit`} className="link">{j.page_title}</Link> : `Page #${j.page_id}`}</td>
                <td>{j.sections_done}/{j.sections_total}</td>
                <td>{statusBadge(j.status)}</td>
                <td style={{ fontSize: 12, color: "var(--danger)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.error || "—"}</td>
              </tr>
            ))}
            {!jobs.length && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No generation jobs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
