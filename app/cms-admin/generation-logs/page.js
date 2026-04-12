"use client";
import React, { useEffect, useState } from "react";
import { fmtDate, useTzRefresh } from "@/lib/fmt";

export default function GenerationLogsPage() {
  const [logs, setLogs] = useState([]);
  const [expanded, setExpanded] = useState(null);
  useTzRefresh();

  useEffect(() => { fetch("/api/generation-logs").then(r => r.json()).then(setLogs); }, []);

  return (
    <>
      <div className="page-header"><h1>Generation Logs</h1></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Time</th><th>Provider</th><th>Model</th><th>Target</th><th>Prompts</th><th>User Prompt</th></tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <React.Fragment key={log.id}>
                <tr onClick={() => setExpanded(expanded === log.id ? null : log.id)} style={{ cursor: "pointer" }}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(log.created_at)}</td>
                  <td>{log.provider}</td>
                  <td style={{ fontSize: 12, fontFamily: "monospace" }}>{log.model}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{log.object_key || log.object_type || "—"}</td>
                  <td style={{ fontSize: 12 }}>
                    {log.system_prompt_id && <span className="var-tag">sys v{log.system_prompt_version}</span>}
                    {log.type_prompt_id && <span className="var-tag">type v{log.type_prompt_version}</span>}
                    {log.object_prompt_id && <span className="var-tag">obj v{log.object_prompt_version}</span>}
                  </td>
                  <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: "var(--text-muted)" }}>
                    {log.user_prompt?.slice(0, 80) || "—"}
                  </td>
                </tr>
                {expanded === log.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <div style={{ padding: 16, background: "var(--bg)", display: "grid", gap: 12 }}>
                        <div>
                          <strong style={{ fontSize: 12 }}>User Prompt</strong>
                          <pre className="prompt-version-content">{log.user_prompt}</pre>
                        </div>
                        <div>
                          <strong style={{ fontSize: 12 }}>Input HTML</strong>
                          <pre className="prompt-version-content">{log.current_html || "(empty)"}</pre>
                        </div>
                        <div>
                          <strong style={{ fontSize: 12 }}>Response HTML</strong>
                          <pre className="prompt-version-content" style={{ maxHeight: 300 }}>{log.response_html}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {!logs.length && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No logs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
