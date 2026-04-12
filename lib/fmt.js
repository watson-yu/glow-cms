import { useState, useEffect } from "react";

export function fmtDate(d) {
  if (!d) return "—";
  const tz = (typeof localStorage !== "undefined" && localStorage.getItem("glow-tz")) || "Asia/Taipei";
  const utc = typeof d === "string" && !d.endsWith("Z") ? d + "Z" : d;
  return new Date(utc).toLocaleString("sv-SE", { timeZone: tz, year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(",", "");
}

export function useTzRefresh() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    window.addEventListener("tz-change", handler);
    return () => window.removeEventListener("tz-change", handler);
  }, []);
}
