import { describe, it, expect, vi } from "vitest";
import {
  buildBulkPrompt,
  mergeGeneratedSection,
  runBulkGeneration,
  failedPages,
} from "./bulkGenerate.js";

describe("buildBulkPrompt", () => {
  it("includes the page title", () => {
    const p = buildBulkPrompt({ title: "Teeth Whitening" }, {});
    expect(p).toContain('"Teeth Whitening"');
  });
  it("folds in category context and admin extra instructions", () => {
    const p = buildBulkPrompt(
      { title: "Botox" },
      { categoryName: "Aesthetics", categoryDescription: "Facial treatments", extra: "Keep it under 300 words." }
    );
    expect(p).toContain("Aesthetics");
    expect(p).toContain("Facial treatments");
    expect(p).toContain("Keep it under 300 words.");
  });
  it("always forbids fences and placeholders so saved HTML is clean", () => {
    const p = buildBulkPrompt({ title: "X" }, {});
    expect(p).toMatch(/no markdown code fences/i);
    expect(p).toMatch(/\{\{placeholders\}\}/);
  });
});

describe("mergeGeneratedSection — regenerate replaces, never duplicates", () => {
  it("appends when the page has no section of the generated type", () => {
    const out = mergeGeneratedSection([], 3, "<section>new</section>");
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ section_type_id: 3, content: "<section>new</section>", variables: {} });
  });

  it("REPLACES the existing section of that type in place (regenerate)", () => {
    const existing = [{ section_type_id: 3, content: "<section>old</section>", variables: {} }];
    const out = mergeGeneratedSection(existing, 3, "<section>fresh</section>");
    expect(out).toHaveLength(1); // not 2 — no duplicate
    expect(out[0].content).toBe("<section>fresh</section>");
  });

  it("treats string and number section_type_id as the same type", () => {
    const existing = [{ section_type_id: "3", content: "old" }];
    const out = mergeGeneratedSection(existing, 3, "fresh");
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("fresh");
  });

  it("preserves other sections and their order, replacing only the matching type", () => {
    const existing = [
      { section_type_id: 1, content: "hero" },
      { section_type_id: 3, content: "old-body" },
      { section_type_id: 5, content: "cta" },
    ];
    const out = mergeGeneratedSection(existing, 3, "new-body");
    expect(out.map((s) => s.content)).toEqual(["hero", "new-body", "cta"]);
  });

  it("parses string-encoded variables and strips join columns like type_name", () => {
    const existing = [{ section_type_id: 1, content: "hero", variables: '{"a":"b"}', type_name: "Hero" }];
    const out = mergeGeneratedSection(existing, 3, "body");
    expect(out[0]).toEqual({ section_type_id: 1, content: "hero", variables: { a: "b" } });
    expect(out[0]).not.toHaveProperty("type_name");
  });
});

describe("runBulkGeneration — failure isolation + progress", () => {
  it("processes every page and reports success in input order", async () => {
    const pages = [{ id: 1, title: "A" }, { id: 2, title: "B" }];
    const processPage = vi.fn().mockResolvedValue();
    const results = await runBulkGeneration(pages, { processPage });
    expect(processPage).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { id: 1, title: "A", ok: true },
      { id: 2, title: "B", ok: true },
    ]);
  });

  it("a failed page does not abort the batch; the error is collected", async () => {
    const pages = [{ id: 1, title: "A" }, { id: 2, title: "B" }, { id: 3, title: "C" }];
    const processPage = vi.fn(async (p) => {
      if (p.id === 2) throw new Error("billing-blocked");
    });
    const results = await runBulkGeneration(pages, { processPage });
    expect(processPage).toHaveBeenCalledTimes(3); // continued past the failure
    expect(results[1]).toEqual({ id: 2, title: "B", ok: false, error: "billing-blocked" });
    expect(results[0].ok).toBe(true);
    expect(results[2].ok).toBe(true);
  });

  it("runs serially — never two processPage calls in flight at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const processPage = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
    });
    await runBulkGeneration([{ id: 1 }, { id: 2 }, { id: 3 }], { processPage });
    expect(maxInFlight).toBe(1);
  });

  it("emits a running event then a terminal ok/failed event per page", async () => {
    const events = [];
    const processPage = async (p) => {
      if (p.id === 2) throw new Error("boom");
    };
    await runBulkGeneration([{ id: 1, title: "A" }, { id: 2, title: "B" }], {
      processPage,
      onProgress: (e) => events.push([e.index, e.status]),
    });
    expect(events).toEqual([
      [0, "running"],
      [0, "ok"],
      [1, "running"],
      [1, "failed"],
    ]);
  });
});

describe("failedPages — input for retrying only what failed", () => {
  it("returns just the pages whose result was a failure", () => {
    const pages = [{ id: 1, title: "A" }, { id: 2, title: "B" }, { id: 3, title: "C" }];
    const results = [
      { id: 1, ok: true },
      { id: 2, ok: false, error: "x" },
      { id: 3, ok: false, error: "y" },
    ];
    expect(failedPages(pages, results)).toEqual([{ id: 2, title: "B" }, { id: 3, title: "C" }]);
  });

  it("returns an empty array when everything succeeded", () => {
    const pages = [{ id: 1 }];
    expect(failedPages(pages, [{ id: 1, ok: true }])).toEqual([]);
  });
});
