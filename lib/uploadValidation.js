// Validation for image uploads handled by app/api/upload/route.js.
//
// SVG is intentionally NOT allowed. SVG is an XML document that can carry
// inline <script> and external references, so serving attacker-supplied SVG
// from our own bucket is a stored-XSS vector. For a CMS logo upload the safe
// default is to reject it rather than ship an SVG sanitizer here.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

// Allowlist of extension -> canonical (server-derived) Content-Type.
// The stored Content-Type is taken from this map, never from client input.
const EXT_CONTENT_TYPE = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// MIME types we accept on the inbound (spoofable) client header. This is a
// coarse first gate only; the authoritative Content-Type comes from the
// validated extension via EXT_CONTENT_TYPE.
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Validate a multipart upload field.
 *
 * @param {unknown} file - the value pulled from formData.get("file")
 * @returns {{ ok: true, ext: string, contentType: string }
 *          | { ok: false, status: number, error: string }}
 */
export function validateImageUpload(file) {
  // 1. Must be an actual File/Blob with the methods we rely on.
  if (
    !file ||
    typeof file !== "object" ||
    typeof file.arrayBuffer !== "function" ||
    typeof file.size !== "number"
  ) {
    return { ok: false, status: 400, error: "No valid file uploaded" };
  }

  // 3. Cap size before any buffering into memory.
  if (file.size <= 0) {
    return { ok: false, status: 400, error: "Empty file" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 400, error: "File too large (max 5 MB)" };
  }

  // 5. Guard the no-dot filename case: require a real extension segment so a
  // missing extension can't become the whole filename / a weird S3 key.
  const name = typeof file.name === "string" ? file.name : "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return { ok: false, status: 400, error: "File must have an extension" };
  }
  const ext = name.slice(dot + 1).toLowerCase();

  // 2. Enforce the extension allowlist.
  const contentType = EXT_CONTENT_TYPE[ext];
  if (!contentType) {
    return { ok: false, status: 400, error: "Unsupported file type" };
  }

  // 2 (cont). Enforce the client MIME allowlist as a secondary gate.
  if (typeof file.type === "string" && file.type && !ALLOWED_MIME.has(file.type)) {
    return { ok: false, status: 400, error: "Unsupported file type" };
  }

  return { ok: true, ext, contentType };
}
