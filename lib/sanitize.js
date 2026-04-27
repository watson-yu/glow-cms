import DOMPurify from "isomorphic-dompurify";

export function sanitizeHtml(html) {
  if (!html) return html;
  return DOMPurify.sanitize(html, { ADD_TAGS: ["style"], ADD_ATTR: ["target"] });
}
