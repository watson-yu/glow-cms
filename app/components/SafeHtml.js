"use client";
import DOMPurify from "isomorphic-dompurify";

export default function SafeHtml({ html, ...props }) {
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html || "", { ADD_TAGS: ["style"], ADD_ATTR: ["target", "style"] }) }} {...props} />;
}
