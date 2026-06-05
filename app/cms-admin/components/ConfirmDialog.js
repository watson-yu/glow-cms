"use client";

/** Styled confirmation modal to replace native confirm(). Controlled by useConfirm. */
export default function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2100 }}>
      <div className="card" style={{ maxWidth: 420, width: "100%", margin: 20 }}>
        {title && <div className="card-title">{title}</div>}
        <p style={{ fontSize: 14, marginBottom: 16, whiteSpace: "pre-line", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="btn btn-primary btn-sm" style={danger ? { background: "var(--danger)" } : undefined} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
