// Shared helpers for LLM HTML generation, used by every provider path in
// app/api/generate/route.js (OpenAI, Claude, Gemini). Keeping the post-processing
// here means the three providers behave identically and the logic is unit-testable
// without pulling in the SDKs, the DB, or Next.js.

// A single large output budget for full-page HTML, applied to all providers.
// Claude was previously capped at 4096 (which truncated full landing pages
// mid-tag) while OpenAI/Gemini were uncapped; standardizing avoids both the
// truncation and the inconsistency. 8192 comfortably fits a full page and is
// within the output limits of the models used here (gpt-4o-mini, Sonnet,
// gemini-2.5-flash).
export const MAX_OUTPUT_TOKENS = 8192;

// Strip a single leading and/or trailing markdown code fence. The system prompt
// tells the model to "return ONLY HTML, no fences", but models sometimes wrap
// the output in ```html ... ``` anyway — and a stray fence renders as literal
// text in a published page. Only the fence markers are removed; the HTML between
// them is left untouched.
export function stripCodeFences(text) {
  if (typeof text !== "string") return text;
  let out = text.trim();
  // Opening fence: ``` optionally followed by a language tag (e.g. ```html),
  // through the end of that line.
  out = out.replace(/^```[^\n`]*\n?/, "");
  // Closing fence: a trailing ``` on its own, optionally preceded by a newline.
  out = out.replace(/\n?```\s*$/, "");
  return out.trim();
}

// Guard against empty/refused completions and clean up stray fences. A
// content-filtered or refused completion comes back as null/empty/whitespace;
// returning that would persist empty HTML to generation_logs as if it were a
// complete page. Throw instead so the caller can surface a clear error and skip
// the insert. Returns fence-stripped HTML on success.
export function cleanGeneratedHtml(rawText) {
  if (typeof rawText !== "string" || rawText.trim() === "") {
    throw new Error(
      "LLM returned an empty response (the request may have been refused or content-filtered)"
    );
  }
  const html = stripCodeFences(rawText);
  if (html.trim() === "") {
    throw new Error("LLM returned no usable HTML (only a code fence wrapper)");
  }
  return html;
}
