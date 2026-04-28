"use client";
import { useEffect, useState, useRef, useCallback } from "react";

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

function TriCheckbox({ checked, indeterminate, onChange }) {
  const ref = useRef();
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} style={{ marginTop: 2 }} />;
}

export default function CategoriesPage() {
  const [tree, setTree] = useState([]);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [createFor, setCreateFor] = useState(null); // category to create page for
  const [pageForm, setPageForm] = useState({ page_template_id: "", page_template_id_l1: "", page_template_id_l2: "", header_id: "", footer_id: "", status: "draft" });
  const [options, setOptions] = useState({ headers: [], footers: [], pageTemplates: [] });
  const [pageMap, setPageMap] = useState({}); // category_id -> page
  const [creating, setCreating] = useState(false);
  const [genStatus, setGenStatus] = useState(null); // { total, done, failed }

  const load = () => fetch("/api/categories").then(r => r.json()).then(setTree);
  const loadPages = () => fetch("/api/pages").then(r => r.json()).then(pages => {
    setPageMap(Object.fromEntries(pages.filter(p => p.category_id).map(p => [p.category_id, p])));
  });
  useEffect(() => {
    load();
    loadPages();
    Promise.all([
      fetch("/api/headers").then(r => r.json()),
      fetch("/api/footers").then(r => r.json()),
      fetch("/api/page-templates?include=sections").then(r => r.json()),
      fetch("/api/section-types").then(r => r.json()),
    ]).then(([h, f, pt, st]) => setOptions({ headers: h, footers: f, pageTemplates: pt, sectionTypes: st }));
  }, []);

  const [selected, setSelected] = useState(new Set());

  function toggleSelect(cat) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
      return next;
    });
  }

  function toggleParent(parent) {
    setSelected(prev => {
      const next = new Set(prev);
      const childIds = parent.children.map(c => c.id);
      const selfOn = prev.has(parent.id);
      const allChildrenOn = childIds.length > 0 && childIds.every(id => prev.has(id));

      if (!selfOn) {
        // State 1: check self only
        next.add(parent.id);
      } else if (!allChildrenOn) {
        // State 2: check self + all children
        next.add(parent.id);
        childIds.forEach(id => next.add(id));
      } else {
        // State 3: clear all
        next.delete(parent.id);
        childIds.forEach(id => next.delete(id));
      }
      return next;
    });
  }

  function toggleSelectAll() {
    const all = tree.flatMap(p => [p, ...p.children]);
    setSelected(prev => prev.size === all.length ? new Set() : new Set(all.map(c => c.id)));
  }

  function openBatchCreate() {
    const all = tree.flatMap(p => [p, ...p.children]);
    const cats = all.filter(c => selected.has(c.id) && !pageMap[c.id]);
    if (!cats.length) return;
    setCreateFor(cats);
    const defaultTpl = options.pageTemplates[0]?.id || "";
    setPageForm({ page_template_id: defaultTpl, page_template_id_l1: defaultTpl, page_template_id_l2: defaultTpl, header_id: "", footer_id: "", status: "draft" });
  }

  async function submitCreatePage(e) {
    e.preventDefault();
    setCreating(true);
    const cats = Array.isArray(createFor) ? createFor : [createFor];
    const hasL1 = cats.some(c => !c.parent_id);
    const hasL2 = cats.some(c => c.parent_id);
    const isMixed = hasL1 && hasL2;
    const createdIds = [];
    const errors = [];
    for (const cat of cats) {
      const tplId = isMixed ? (cat.parent_id ? pageForm.page_template_id_l2 : pageForm.page_template_id_l1) : pageForm.page_template_id;
      try {
        const res = await fetch("/api/pages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: cat.name, slug: cat.slug, category_id: cat.id, page_template_id: tplId, header_id: pageForm.header_id, footer_id: pageForm.footer_id, status: pageForm.status }),
        });
        const data = await res.json();
        if (data.id) createdIds.push(data.id);
        else errors.push(`${cat.name}: ${data.error || "Unknown error"}`);
      } catch (e) { errors.push(`${cat.name}: ${e.message}`); }
    }
    if (errors.length) alert(`Failed to create ${errors.length} page(s):\n${errors.join("\n")}`);
    setCreating(false);
    setCreateFor(null);
    setSelected(new Set());
    loadPages();
    if (createdIds.length) {
      setGenStatus({ total: createdIds.length, done: 0, failed: 0 });
      let done = 0, failed = 0;
      for (const pid of createdIds) {
        try {
          const r = await fetch(`/api/pages/${pid}/generate-variables`, { method: "POST" });
          if (r.ok) done++; else failed++;
        } catch { failed++; }
        setGenStatus({ total: createdIds.length, done: done + failed, failed });
      }
      setTimeout(() => setGenStatus(null), failed ? 8000 : 3000);
    }
  }

  async function clearAll() {
    if (!confirm("Delete ALL categories? This cannot be undone.")) return;
    await fetch("/api/categories/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
    load();
  }

  async function syncFromExternal() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await fetch("/api/categories/sync", { method: "POST" });
      const data = await r.json();
      if (!r.ok) { setSyncResult({ error: data.error }); return; }
      setSyncResult({ ok: true, ...data.synced });
      load();
    } catch (e) { setSyncResult({ error: e.message }); }
    finally { setSyncing(false); }
  }

  function startAdd(parent_id) {
    setAdding({ parent_id: parent_id || null, name: "", slug: "" });
    setEditing(null);
  }

  function startEdit(cat) {
    setEditing({ id: cat.id, name: cat.name, slug: cat.slug, sort_order: cat.sort_order ?? 0, parent_id: cat.parent_id, description: cat.description || "" });
    setAdding(null);
  }

  async function saveNew(e) {
    e.preventDefault();
    await fetch("/api/categories", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adding),
    });
    setAdding(null);
    load();
  }

  async function saveEdit(e) {
    e.preventDefault();
    await fetch(`/api/categories/${editing.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name, slug: editing.slug, sort_order: editing.sort_order }),
    });
    setEditing(null);
    load();
  }

  async function del(id, name) {
    if (!confirm(`Delete "${name}"? Children will also be deleted.`)) return;
    await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (editing?.id === id) setEditing(null);
    load();
  }

  function InlineForm({ data, setData, onSubmit, onCancel }) {
    return (
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
        <input className="form-input" placeholder="Name" value={data.name} required style={{ flex: 1 }}
          onChange={e => setData({ ...data, name: e.target.value, slug: slugify(e.target.value) })} />
        <input className="form-input" placeholder="Description" value={data.description || ""} style={{ flex: 1, fontSize: 13 }}
          onChange={e => setData({ ...data, description: e.target.value })} />
        <input className="form-input" placeholder="Slug" value={data.slug} required style={{ width: 160 }}
          onChange={e => setData({ ...data, slug: e.target.value })} />
        <button type="submit" className="btn btn-primary btn-sm">Save</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </form>
    );
  }

  return (
    <>
      <div style={{ position: "sticky", top: -32, zIndex: 10, background: "var(--bg)", paddingTop: 32, paddingBottom: 8, marginBottom: 8 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h1>Categories</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
            {syncResult && (syncResult.error
              ? <span style={{ color: "var(--danger)" }}>✗ {syncResult.error}</span>
              : <span style={{ color: "var(--success, #16a34a)" }}>✓ Synced {syncResult.l1} L1 + {syncResult.l2} L2</span>
            )}
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={syncFromExternal} disabled={syncing}>{syncing ? "Syncing…" : "⟳ Sync"}</button>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: "var(--danger)" }} onClick={clearAll}>✗ Clear All</button>
            <button className="btn btn-primary btn-sm" onClick={() => startAdd(null)}>+ Add Top-Level</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCollapsed(Object.fromEntries(tree.map(p => [p.id, true])))}>Collapse All</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCollapsed({})}>Expand All</button>
          <span style={{ color: "var(--border)" }}>|</span>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" onChange={toggleSelectAll} checked={tree.length > 0 && selected.size === tree.flatMap(p => [p, ...p.children]).length} /> Select All
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" onChange={() => {
              const l1Ids = tree.map(p => p.id);
              setSelected(prev => {
                const allOn = l1Ids.every(id => prev.has(id));
                const next = new Set(prev);
                l1Ids.forEach(id => allOn ? next.delete(id) : next.add(id));
                return next;
              });
            }} checked={tree.length > 0 && tree.every(p => selected.has(p.id))} /> L1
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" onChange={() => {
              const l2Ids = tree.flatMap(p => p.children.map(c => c.id));
              setSelected(prev => {
                const allOn = l2Ids.length > 0 && l2Ids.every(id => prev.has(id));
                const next = new Set(prev);
                l2Ids.forEach(id => allOn ? next.delete(id) : next.add(id));
                return next;
              });
            }} checked={tree.flatMap(p => p.children).length > 0 && tree.flatMap(p => p.children).every(c => selected.has(c.id))} /> L2
          </label>
          <button className="btn btn-primary btn-sm" onClick={openBatchCreate} disabled={!selected.size || ![...selected].some(id => !pageMap[id])}>+ Create Pages ({[...selected].filter(id => !pageMap[id]).length})</button>
        </div>
      </div>

      {genStatus && (
        <div style={{ padding: "8px 16px", marginBottom: 8, borderRadius: 6, fontSize: 13, background: genStatus.failed ? "var(--danger-bg, #fef2f2)" : "var(--bg-muted, #f5f5f5)", color: genStatus.failed ? "var(--danger)" : "var(--text-muted)" }}>
          {genStatus.done < genStatus.total
            ? `Generating variables… ${genStatus.done}/${genStatus.total}`
            : genStatus.failed
              ? `Generated ${genStatus.total - genStatus.failed}/${genStatus.total} — ${genStatus.failed} failed (check pages manually)`
              : `✓ Generated variables for ${genStatus.total} page${genStatus.total > 1 ? "s" : ""}`}
        </div>
      )}

      {adding && !adding.parent_id && (
        <div className="card" style={{ marginBottom: 12 }}>
          <InlineForm data={adding} setData={setAdding} onSubmit={saveNew} onCancel={() => setAdding(null)} />
        </div>
      )}

      {tree.map(parent => (
        <div key={parent.id} className="card" style={{ marginBottom: 12, padding: "12px 16px" }}>
          {editing?.id === parent.id ? (
            <InlineForm data={editing} setData={setEditing} onSubmit={saveEdit} onCancel={() => setEditing(null)} />
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <TriCheckbox
                checked={selected.has(parent.id)}
                indeterminate={selected.has(parent.id) && parent.children.length > 0 && !parent.children.every(c => selected.has(c.id))}
                onChange={() => toggleParent(parent)}
              />
              <span onClick={() => setCollapsed(c => ({ ...c, [parent.id]: !c[parent.id] }))} style={{ cursor: "pointer", fontSize: 12, userSelect: "none", width: 16 }}>{collapsed[parent.id] ? "▶" : "▼"}</span>
              <div style={{ flex: 1 }}>
                <strong>{parent.name}</strong>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>/{parent.slug}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>({parent.children.length})</span>
                {parent.description && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>{parent.description}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px", fontSize: 12, whiteSpace: "nowrap", marginLeft: 8 }}>
                <span style={{ color: "var(--text-muted)" }}>{[parent.id, ...parent.children.map(c => c.id)].filter(id => pageMap[id]).length}/{1 + parent.children.length}</span>
                {pageMap[parent.id] ? <>
                  <a href={`/cms-admin/pages/${pageMap[parent.id].id}/edit`} className="link" style={{ fontSize: 12 }}>Edit</a>
                  <a href={`/preview/${pageMap[parent.id].slug}`} target="_blank" className="link" style={{ fontSize: 12 }}>Preview</a>
                </> : <span style={{ color: "var(--text-muted)" }}>—</span>}
              </div>
              <span style={{ color: "var(--border)", margin: "0 2px" }}>|</span>
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(parent)} title="Edit category">✎</button>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => del(parent.id, parent.name)} title="Delete category">✕</button>
            </div>
          )}

          {!collapsed[parent.id] && parent.children.length > 0 && (
            <div style={{ paddingLeft: 20, marginTop: 6, borderLeft: "2px solid var(--border)" }}>
              {parent.children.map(child => (
                <div key={child.id} style={{ padding: "3px 0" }}>
                  {editing?.id === child.id ? (
                    <InlineForm data={editing} setData={setEditing} onSubmit={saveEdit} onCancel={() => setEditing(null)} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 14 }}>
                      <input type="checkbox" checked={selected.has(child.id)} onChange={() => toggleSelect(child)} style={{ marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <span>{child.name}</span>
                        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>/{child.slug}</span>
                        {child.description && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1, lineHeight: 1.3 }}>{child.description}</div>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px", fontSize: 12, whiteSpace: "nowrap", marginLeft: 8 }}>
                        {pageMap[child.id] ? <>
                          <a href={`/cms-admin/pages/${pageMap[child.id].id}/edit`} className="link" style={{ fontSize: 12 }}>Edit</a>
                          <a href={`/preview/${pageMap[child.id].slug}`} target="_blank" className="link" style={{ fontSize: 12 }}>Preview</a>
                        </> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </div>
                      <span style={{ color: "var(--border)", margin: "0 2px" }}>|</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(child)} title="Edit category">✎</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => del(child.id, child.name)} title="Delete category">✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!collapsed[parent.id] && (
            <div style={{ paddingLeft: 20, marginTop: 4 }}>
              {adding?.parent_id === parent.id && (
                <InlineForm data={adding} setData={setAdding} onSubmit={saveNew} onCancel={() => setAdding(null)} />
              )}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startAdd(parent.id)}>+ Add Subcategory</button>
            </div>
          )}
        </div>
      ))}

      {!tree.length && !adding && (
        <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
          No categories yet. Add your first top-level category!
        </div>
      )}

      {createFor && (
        <>
          <div onClick={() => setCreateFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "var(--bg)", borderRadius: 8, padding: 24, zIndex: 1001, width: 400, boxShadow: "0 8px 30px rgba(0,0,0,.2)" }}>
            <h3 style={{ margin: "0 0 16px" }}>Create {Array.isArray(createFor) ? `${createFor.length} Pages` : `Page: ${createFor.name}`}</h3>
            <form onSubmit={submitCreatePage}>
              {Array.isArray(createFor) && (
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, maxHeight: 120, overflow: "auto" }}>
                  {createFor.map(c => <div key={c.id}>{c.name} <span style={{ color: "var(--text-muted)" }}>/{c.slug}</span></div>)}
                </div>
              )}
              {(() => {
                const cats = Array.isArray(createFor) ? createFor : [createFor];
                const l1 = cats.filter(c => !c.parent_id);
                const l2 = cats.filter(c => c.parent_id);
                const isMixed = l1.length > 0 && l2.length > 0;

                function BlueprintSummary({ tplId }) {
                  const tpl = options.pageTemplates.find(t => String(t.id) === String(tplId));
                  if (!tpl || (!tpl.header_id && !tpl.footer_id && !tpl.sections?.length)) return null;
                  const hName = options.headers.find(h => h.id === tpl.header_id)?.name;
                  const fName = options.footers.find(f => f.id === tpl.footer_id)?.name;
                  const sNames = (tpl.sections || []).map(s => (options.sectionTypes || []).find(st => st.id === s.section_type_id)?.name || `#${s.section_type_id}`);
                  return (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--bg-muted, #f5f5f5)", borderRadius: 6, padding: "6px 10px", marginTop: 4 }}>
                      {[hName && `Header: ${hName}`, fName && `Footer: ${fName}`, sNames.length && `${sNames.length} section${sNames.length > 1 ? "s" : ""} (${sNames.join(", ")})`].filter(Boolean).join(" · ")}
                    </div>
                  );
                }

                if (isMixed) {
                  return (
                    <>
                      <div className="form-field">
                        <label>Template for L1 categories ({l1.length})</label>
                        <select className="form-input" value={pageForm.page_template_id_l1} onChange={e => setPageForm({ ...pageForm, page_template_id_l1: e.target.value })}>
                          {options.pageTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <BlueprintSummary tplId={pageForm.page_template_id_l1} />
                      </div>
                      <div className="form-field">
                        <label>Template for L2 categories ({l2.length})</label>
                        <select className="form-input" value={pageForm.page_template_id_l2} onChange={e => setPageForm({ ...pageForm, page_template_id_l2: e.target.value })}>
                          {options.pageTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <BlueprintSummary tplId={pageForm.page_template_id_l2} />
                      </div>
                    </>
                  );
                }

                const tpl = options.pageTemplates.find(t => String(t.id) === String(pageForm.page_template_id));
                const isBlueprint = tpl && (tpl.header_id || tpl.footer_id || tpl.sections?.length);
                return (
                  <>
                    <div className="form-field">
                      <label>Page Template</label>
                      <select className="form-input" value={pageForm.page_template_id} onChange={e => setPageForm({ ...pageForm, page_template_id: e.target.value, header_id: "", footer_id: "" })}>
                        {options.pageTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <BlueprintSummary tplId={pageForm.page_template_id} />
                    </div>
                    {!isBlueprint && (
                      <>
                        <div className="form-field">
                          <label>Header</label>
                          <select className="form-input" value={pageForm.header_id} onChange={e => setPageForm({ ...pageForm, header_id: e.target.value })}>
                            <option value="">— None —</option>
                            {options.headers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                          </select>
                        </div>
                        <div className="form-field">
                          <label>Footer</label>
                          <select className="form-input" value={pageForm.footer_id} onChange={e => setPageForm({ ...pageForm, footer_id: e.target.value })}>
                            <option value="">— None —</option>
                            {options.footers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
              <div className="form-field">
                <label>Status</label>
                <select className="form-input" value={pageForm.status} onChange={e => setPageForm({ ...pageForm, status: e.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setCreateFor(null)} disabled={creating}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? "Creating…" : `Create ${Array.isArray(createFor) ? `${createFor.length} Pages` : "Page"}`}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
