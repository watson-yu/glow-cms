"use client";
import { useState, useCallback } from "react";
import ConfirmDialog from "./ConfirmDialog";

/**
 * Promise-based confirmation to replace native confirm().
 * Usage:
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm("Delete this?", { danger: true, confirmLabel: "Delete" }))) return;
 *   return <>{confirmDialog}...</>;
 */
export function useConfirm() {
  const [state, setState] = useState(null); // { message, resolve, title, danger, confirmLabel }
  const confirm = useCallback((message, opts = {}) =>
    new Promise(resolve => setState({ message, resolve, ...opts })), []);
  function close(result) {
    if (state) state.resolve(result);
    setState(null);
  }
  const confirmDialog = (
    <ConfirmDialog
      open={!!state}
      title={state?.title}
      message={state?.message || ""}
      confirmLabel={state?.confirmLabel}
      danger={state?.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
  return { confirm, confirmDialog };
}
