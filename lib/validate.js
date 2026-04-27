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
  return s === "draft" || s === "published";
}

export function err(msg) {
  return NextResponse.json({ error: msg }, { status: 400 });
}
