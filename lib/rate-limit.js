const hits = new Map();

/**
 * Simple in-memory rate limiter. Returns true if request is allowed.
 * @param {string} key - identifier (e.g. IP or "global")
 * @param {number} maxRequests - max requests in window
 * @param {number} windowMs - window in milliseconds
 */
export function rateLimit(key, maxRequests = 10, windowMs = 60_000) {
  const now = Date.now();
  let entry = hits.get(key);
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 1 };
    hits.set(key, entry);
    return true;
  }
  entry.count++;
  return entry.count <= maxRequests;
}
