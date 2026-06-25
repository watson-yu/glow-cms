"use client";
import { useState } from "react";
import { buildBulkPrompt, mergeGeneratedSection, runBulkGeneration, failedPages } from "@/lib/bulkGenerate";

const PROVIDERS = [
  { value: "gemini", label: "Gemini (2.5 Flash)" },
  { value: "openai", label: "OpenAI (GPT-4o-mini)" },
];

// One page's full pipeline: fetch its current sections → POST /api/generate →
// merge the HTML into the chosen section (replace-not-duplicate) → PUT the page.
// Throws (with a clear message) on any failure so the orchestrator records it.
function makeProcessPage({ provider, sectionTypeId, publish, extra, categoryById }) {
  return async (page) => {
    const detail = await fetch(`/api/pages/${page.id}`).then((r) => r.json());
    if (detail.error) throw new Error(detail.error);

    const cat = page.category_id ? categoryById[page.category_id] : null;
    const prompt = buildBulkPrompt(page, {
      categoryName: cat?.name,
      categoryDescription: cat?.description,
      extra,
    });

    const genRes = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, prompt }),
    });
    const gen = await genRes.json();
    if (!genRes.ok || gen.error) {
      throw new Error(gen.error || `Generation failed (HTTP ${genRes.status})`);
    }

    const sections = mergeGeneratedSection(detail.sections, sectionTypeId, gen.html);
    const putRes = await fetch(`/api/pages/${page.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: detail.title,
        slug: detail.slug,
        header_id: detail.header_id,
        footer_id: detail.footer_id,
        page_template_id: detail.page_template_id,
        status: publish ? "published" : detail.status,
        category_id: detail.category_id,
        meta_title: detail.meta_title,
        meta_description: detail.meta_description,
        og_image: detail.og_image,
        canonical: detail.canonical,
        sections,
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.error || `Save failed (HTTP ${putRes.status})`);
    }
  };
}

export default function BulkGenerate({ pages, sectionTypes, categories, onClose, onDone }) {
  const [provider, setProvider] = useState("gemini");
  const [sectionTypeId, setSectionTypeId] = useState(sectionTypes[0]?.id || "");
  const [publish, setPublish] = useState(false);
  const [extra, setExtra] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // { index, total, currentTitle }
  const [rowResults, setRowResults] = useState({}); // id -> { status, error }
  const [summary, setSummary] = useState(null); // { pages, results }

  const categoryById = Object.fromEntries(
    categories.flatMap((p) => [p, ...(p.children || [])]).map((c) => [c.id, c])
  );

  const publishedCount = pages.filter((p) => p.status === "published").length;

  async function run(targetPages) {
    setRunning(true);
    setSummary(null);
    setRowResults((prev) => {
      const next = { ...prev };
      targetPages.forEach((p) => { next[p.id] = { status: "queued" }; });
      return next;
    });

    const processPage = makeProcessPage({ provider, sectionTypeId, publish, extra, categoryById });
    const results = await runBulkGeneration(targetPages, {
      processPage,
      onProgress: ({ index, total, page, status, result }) => {
        if (status === "running") {
          setProgress({ index, total, currentTitle: page.title });
          setRowResults((prev) => ({ ...prev, [page.id]: { status: "running" } }));
        } else {
          setRowResults((prev) => ({ ...prev, [page.id]: { status, error: result?.error } }));
        }
      },
    });

    setRunning(false);
    setProgress(null);
    setSummary({ pages: targetPages, results });
    onDone?.();
  }

  function start() {
    if (publish && publishedCount > 0 &&
        !confirm(`This will overwrite content on ${publishedCount} already-published page(s). Continue?`)) {
      return;
    }
    if (!publish && publishedCount > 0 &&
        !confirm(`${publishedCount} of these page(s) are already published. Their content will be regenerated and overwritten in place. Continue?`)) {
      return;
    }
    run(pages);
  }

  const failed = summary ? failedPages(summary.pages, summary.results) : [];
  const okCount = summary ? summary.results.filter((r) => r.ok).length : 0;

  return (
    <>
      <div onClick={running ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "var(--bg)", borderRadius: 8, padding: 24, zIndex: 1001, width: 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 8px 30px rgba(0,0,0,.2)" }}>
        <h3 style={{ margin: "0 0 4px" }}>Generate Content</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
          AI-generate and save content for {pages.length} selected page{pages.length === 1 ? "" : "s"}, one at a time.
        </p>

        {!summary && (
          <>
            <div className="form-field">
              <label>Provider</label>
              <select className="form-input" value={provider} onChange={(e) => setProvider(e.target.value)} disabled={running}>
                {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Default Gemini (best quality/$). Anthropic is intentionally omitted — it is currently billing-blocked.</p>
            </div>
            <div className="form-field">
              <label>Save into section type</label>
              <select className="form-input" value={sectionTypeId} onChange={(e) => setSectionTypeId(e.target.value)} disabled={running}>
                {sectionTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Re-running replaces this section on each page — it never duplicates.</p>
            </div>
            <div className="form-field">
              <label>Extra instructions (optional)</label>
              <textarea className="form-input" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} disabled={running} placeholder="Applied to every page, e.g. “Use a friendly tone, include a CTA.”" />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, margin: "8px 0 16px" }}>
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} disabled={running} />
              Set pages to <strong>published</strong> after generating
            </label>
          </>
        )}

        {(running || summary) && (
          <div style={{ margin: "8px 0 16px", border: "1px solid var(--border)", borderRadius: 6, maxHeight: 280, overflow: "auto" }}>
            {pages.map((p) => {
              const r = rowResults[p.id] || {};
              const icon = r.status === "ok" ? "✓" : r.status === "failed" ? "✗" : r.status === "running" ? "⟳" : "·";
              const color = r.status === "ok" ? "var(--success, #16a34a)" : r.status === "failed" ? "var(--danger)" : "var(--text-muted)";
              return (
                <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "5px 10px", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color, width: 14 }}>{icon}</span>
                  <span style={{ flex: 1 }}>{p.title}</span>
                  {r.error && <span style={{ color: "var(--danger)", fontSize: 12, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.error}>{r.error}</span>}
                </div>
              );
            })}
          </div>
        )}

        {running && progress && (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Generating {progress.index + 1} of {progress.total}: <strong>{progress.currentTitle}</strong>…
          </p>
        )}

        {summary && (
          <p style={{ fontSize: 14, margin: "4px 0 12px" }}>
            Done: <span style={{ color: "var(--success, #16a34a)" }}>{okCount} succeeded</span>
            {failed.length > 0 && <>, <span style={{ color: "var(--danger)" }}>{failed.length} failed</span></>}.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          {!running && !summary && (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={start} disabled={!sectionTypeId || !pages.length}>
                Generate {pages.length} page{pages.length === 1 ? "" : "s"}
              </button>
            </>
          )}
          {running && <button type="button" className="btn btn-ghost" disabled>Running…</button>}
          {summary && (
            <>
              {failed.length > 0 && (
                <button type="button" className="btn btn-secondary" onClick={() => run(failed)}>Retry {failed.length} failed</button>
              )}
              <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
