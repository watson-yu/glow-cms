// Pure helpers for the prompt versioning system (no DB/React), so the
// version-selection logic is unit-testable independently of MySQL.

// Compute the next prompt version from the current max version for a scope_key.
// `currentMax` is COALESCE(MAX(version), 0) — i.e. 0 when no versions exist yet.
// Always returns a positive integer one greater than the current max.
export function nextPromptVersion(currentMax) {
  const max = Number.isFinite(currentMax) ? currentMax : 0;
  return Math.max(0, Math.trunc(max)) + 1;
}
