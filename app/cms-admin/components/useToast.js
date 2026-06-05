"use client";
import { useState, useRef, useCallback } from "react";
import Toast from "./Toast";

/**
 * Toast notifications to replace native alert().
 * Usage:
 *   const { showNotice, toast } = useToast();
 *   showNotice("error", "Something went wrong");
 *   return <>{toast}...</>;
 */
export function useToast() {
  const [notice, setNotice] = useState(null);
  const timer = useRef();
  const showNotice = useCallback((type, text, ms = type === "success" ? 9000 : 7000) => {
    setNotice({ type, text });
    clearTimeout(timer.current);
    if (ms) timer.current = setTimeout(() => setNotice(null), ms);
  }, []);
  const toast = <Toast notice={notice} onClose={() => setNotice(null)} />;
  return { showNotice, toast };
}
