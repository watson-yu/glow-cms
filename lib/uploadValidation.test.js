import { describe, it, expect } from "vitest";
import { validateImageUpload, MAX_UPLOAD_BYTES } from "./uploadValidation.js";

// Minimal File/Blob stand-in: validateImageUpload only touches name/type/size
// and the presence of an arrayBuffer method.
function fakeFile({ name, type, size }) {
  return { name, type, size, arrayBuffer: async () => new ArrayBuffer(0) };
}

describe("validateImageUpload", () => {
  it("accepts a normal png", () => {
    const r = validateImageUpload(fakeFile({ name: "logo.png", type: "image/png", size: 1234 }));
    expect(r).toEqual({ ok: true, ext: "png", contentType: "image/png" });
  });

  it("accepts jpg/jpeg/webp and maps to canonical Content-Type", () => {
    expect(validateImageUpload(fakeFile({ name: "a.JPG", type: "image/jpeg", size: 10 })).contentType).toBe("image/jpeg");
    expect(validateImageUpload(fakeFile({ name: "a.jpeg", type: "image/jpeg", size: 10 })).contentType).toBe("image/jpeg");
    expect(validateImageUpload(fakeFile({ name: "a.webp", type: "image/webp", size: 10 })).contentType).toBe("image/webp");
  });

  it("ignores a spoofed MIME type and trusts the extension for Content-Type", () => {
    const r = validateImageUpload(fakeFile({ name: "logo.png", type: "", size: 10 }));
    expect(r).toEqual({ ok: true, ext: "png", contentType: "image/png" });
  });

  it("rejects a missing/invalid file", () => {
    expect(validateImageUpload(null).ok).toBe(false);
    expect(validateImageUpload("not-a-file").ok).toBe(false);
    expect(validateImageUpload({ name: "x.png", type: "image/png", size: 1 }).ok).toBe(false); // no arrayBuffer
  });

  it("rejects SVG by default", () => {
    const r = validateImageUpload(fakeFile({ name: "x.svg", type: "image/svg+xml", size: 10 }));
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it("rejects disallowed extensions like .html", () => {
    expect(validateImageUpload(fakeFile({ name: "evil.html", type: "text/html", size: 10 })).ok).toBe(false);
  });

  it("rejects a filename with no extension instead of using the whole name", () => {
    expect(validateImageUpload(fakeFile({ name: "logo", type: "image/png", size: 10 })).ok).toBe(false);
    expect(validateImageUpload(fakeFile({ name: "logo.", type: "image/png", size: 10 })).ok).toBe(false);
    expect(validateImageUpload(fakeFile({ name: ".png", type: "image/png", size: 10 })).ok).toBe(false);
  });

  it("rejects an allowed extension whose client MIME is disallowed", () => {
    const r = validateImageUpload(fakeFile({ name: "logo.png", type: "text/html", size: 10 }));
    expect(r.ok).toBe(false);
  });

  it("rejects empty and oversized files", () => {
    expect(validateImageUpload(fakeFile({ name: "a.png", type: "image/png", size: 0 })).ok).toBe(false);
    expect(validateImageUpload(fakeFile({ name: "a.png", type: "image/png", size: MAX_UPLOAD_BYTES + 1 })).ok).toBe(false);
    expect(validateImageUpload(fakeFile({ name: "a.png", type: "image/png", size: MAX_UPLOAD_BYTES })).ok).toBe(true);
  });
});
