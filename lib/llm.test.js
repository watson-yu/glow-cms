import { describe, it, expect } from "vitest";
import { stripCodeFences, cleanGeneratedHtml, MAX_OUTPUT_TOKENS } from "./llm.js";

describe("stripCodeFences", () => {
  it("strips a ```html fenced wrapper", () => {
    expect(stripCodeFences("```html\n<div>hi</div>\n```")).toBe("<div>hi</div>");
  });
  it("strips a bare ``` fenced wrapper", () => {
    expect(stripCodeFences("```\n<p>x</p>\n```")).toBe("<p>x</p>");
  });
  it("strips other language tags too", () => {
    expect(stripCodeFences("```HTML\n<p>x</p>\n```")).toBe("<p>x</p>");
  });
  it("tolerates surrounding whitespace", () => {
    expect(stripCodeFences("  \n```html\n<p>x</p>\n```  \n")).toBe("<p>x</p>");
  });
  it("strips a lone opening fence", () => {
    expect(stripCodeFences("```html\n<p>x</p>")).toBe("<p>x</p>");
  });
  it("strips a lone closing fence", () => {
    expect(stripCodeFences("<p>x</p>\n```")).toBe("<p>x</p>");
  });
  it("leaves unfenced HTML unchanged", () => {
    const html = "<section>\n  <h1>Title</h1>\n</section>";
    expect(stripCodeFences(html)).toBe(html);
  });
  it("does not touch backticks inside the HTML body", () => {
    const html = "<code>const x = `t`;</code>";
    expect(stripCodeFences(html)).toBe(html);
  });
  it("preserves a fenced code block in the middle of content", () => {
    const html = "<p>before</p>\n```\nnot a wrapper\n```\n<p>after</p>";
    expect(stripCodeFences(html)).toBe(html);
  });
  it("returns non-strings as-is", () => {
    expect(stripCodeFences(null)).toBe(null);
    expect(stripCodeFences(undefined)).toBe(undefined);
  });
});

describe("cleanGeneratedHtml", () => {
  it("returns fence-stripped HTML for a valid wrapped response", () => {
    expect(cleanGeneratedHtml("```html\n<div>ok</div>\n```")).toBe("<div>ok</div>");
  });
  it("returns plain HTML unchanged", () => {
    expect(cleanGeneratedHtml("<div>ok</div>")).toBe("<div>ok</div>");
  });
  it("throws on null (content filter / refusal)", () => {
    expect(() => cleanGeneratedHtml(null)).toThrow(/empty response/);
  });
  it("throws on undefined", () => {
    expect(() => cleanGeneratedHtml(undefined)).toThrow(/empty response/);
  });
  it("throws on an empty string", () => {
    expect(() => cleanGeneratedHtml("")).toThrow(/empty response/);
  });
  it("throws on whitespace-only text", () => {
    expect(() => cleanGeneratedHtml("   \n  ")).toThrow(/empty response/);
  });
  it("throws when only a code fence wrapper is present", () => {
    expect(() => cleanGeneratedHtml("```html\n```")).toThrow(/no usable HTML/);
  });
});

describe("MAX_OUTPUT_TOKENS", () => {
  it("is a sane large budget for full-page HTML", () => {
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(8192);
  });
});
