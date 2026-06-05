"use client";

/**
 * Lightweight, non-blocking notification to replace native alert().
 *
 * Usage:
 *   const [notice, setNotice] = useState(null);
 *   <Toast notice={notice} onClose={() => setNotice(null)} />
 *   // notice = { type: "success" | "error" | "info", text: string }
 */
export default function Toast({ notice, onClose }) {
  if (!notice) return null;
  const color =
    notice.type === "error" ? "var(--danger)" :
    notice.type === "info" ? "var(--primary, #4f46e5)" :
    "#16a34a";
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 2000, maxWidth: 400,
        background: "#fff", border: "1px solid var(--border)", borderLeft: `4px solid ${color}`,
        borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: "12px 14px",
        display: "flex", gap: 12, alignItems: "flex-start",
      }}
    >
      <div style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-line", lineHeight: 1.5, flex: 1 }}>{notice.text}</div>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="btn btn-ghost btn-sm" style={{ padding: "0 6px", lineHeight: 1 }}>✕</button>
    </div>
  );
}
