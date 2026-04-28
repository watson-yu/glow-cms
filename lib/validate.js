import { NextResponse } from "next/server";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function validId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0;
}

export function validSlug(s) {
  return typeof s === "string" && s.length > 0 && s.length <= 200 && SLUG_RE.test(s);
}

export function validString(s, maxLen = 1000) {
  return typeof s === "string" && s.trim().length > 0 && s.length <= maxLen;
}

export function validStatus(s) {
  return ["draft", "generating", "ready_for_review", "generation_failed", "published"].includes(s);
}

export function err(msg) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export function safeJsonParse(str, fallback) {
  if (typeof str !== "string") return str ?? fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
