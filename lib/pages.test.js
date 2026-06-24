import { describe, it, expect, vi, beforeEach } from "vitest";

// getPageBySlug is the core public-page builder. These tests exercise its
// assembly logic — section ordering, {{content}} injection, the two-pass
// variable substitution + stripUnresolved boundary, and missing-page/section
// behavior — against a mocked DB layer (injected fake rows, no live MySQL).

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: { query } }));

// Route each pool.query() call to the rows a given test wants. content_path is
// checked before the generic site_config branch because getContentPath's SQL
// mentions both "site_config" and "content_path".
function setupDb({ pages = [], sections = [], config = [], contentPath } = {}) {
  query.mockImplementation(async (sql) => {
    if (sql.includes("content_path")) {
      return [contentPath !== undefined ? [{ config_value: contentPath }] : []];
    }
    if (sql.includes("FROM pages")) return [pages];
    if (sql.includes("FROM sections")) return [sections];
    if (sql.includes("FROM site_config")) return [config];
    return [[]];
  });
}

let pages;
beforeEach(async () => {
  // Reset module state between tests so getSiteConfig's 10s in-memory cache from
  // one test never leaks its config into the next.
  vi.resetModules();
  query.mockReset();
  pages = await import("./pages.js");
});

describe("getPageBySlug — missing page / section behavior", () => {
  it("returns null when no page matches the slug", async () => {
    setupDb({ pages: [] });
    expect(await pages.getPageBySlug("nope")).toBeNull();
  });

  it("does not query sections when the page is missing", async () => {
    setupDb({ pages: [] });
    await pages.getPageBySlug("nope");
    const sectionQueried = query.mock.calls.some((c) => c[0].includes("FROM sections"));
    expect(sectionQueried).toBe(false);
  });

  it("renders an empty {{content}} when the page has no sections", async () => {
    setupDb({
      pages: [{ id: 7, slug: "bare", template_content: "<main>{{content}}</main>" }],
      sections: [],
      config: [],
    });
    const page = await pages.getPageBySlug("bare");
    expect(page.sections).toEqual([]);
    expect(page.body_content).toBe("<main></main>");
  });

  it("scopes the published filter into the page query", async () => {
    setupDb({ pages: [{ id: 1, slug: "x" }], sections: [], config: [] });
    await pages.getPageBySlug("x", true);
    const pageSql = query.mock.calls.find((c) => c[0].includes("FROM pages"))[0];
    expect(pageSql).toContain("p.status = 'published'");

    query.mockClear();
    setupDb({ pages: [{ id: 1, slug: "x" }], sections: [], config: [] });
    await pages.getPageBySlug("x", false);
    const draftSql = query.mock.calls.find((c) => c[0].includes("FROM pages"))[0];
    expect(draftSql).not.toContain("p.status = 'published'");
  });
});

describe("getPageBySlug — section ordering and {{content}} injection", () => {
  it("joins section content in row order, separated by newlines", async () => {
    setupDb({
      pages: [{ id: 1, slug: "p", template_content: "{{content}}" }],
      sections: [
        { id: 1, content: "A", variables: null },
        { id: 2, content: "B", variables: null },
        { id: 3, content: "C", variables: null },
      ],
      config: [],
    });
    const page = await pages.getPageBySlug("p");
    expect(page.body_content).toBe("A\nB\nC");
  });

  it("defaults to a bare {{content}} template when the page has no template", async () => {
    setupDb({
      pages: [{ id: 1, slug: "p", template_content: null }],
      sections: [{ id: 1, content: "<h1>Hi</h1>", variables: null }],
      config: [],
    });
    const page = await pages.getPageBySlug("p");
    expect(page.body_content).toBe("<h1>Hi</h1>");
  });

  it("fills every {{content}} placeholder, not just the first", async () => {
    setupDb({
      pages: [{ id: 1, slug: "p", template_content: "{{content}}|{{content}}" }],
      sections: [{ id: 1, content: "X", variables: null }],
      config: [],
    });
    const page = await pages.getPageBySlug("p");
    expect(page.body_content).toBe("X|X");
  });

  it("injects $-sequences in section HTML literally (no replace-pattern interpretation)", async () => {
    setupDb({
      pages: [{ id: 1, slug: "p", template_content: "<div>{{content}}</div>" }],
      sections: [{ id: 1, content: "price $$5 and $& and $1", variables: null }],
      config: [],
    });
    const page = await pages.getPageBySlug("p");
    expect(page.body_content).toBe("<div>price $$5 and $& and $1</div>");
  });
});

describe("getPageBySlug — two-pass substitution + stripUnresolved boundary", () => {
  it("resolves section vars in pass one, then config in pass two", async () => {
    setupDb({
      pages: [{ id: 1, slug: "p", template_content: "{{content}}" }],
      sections: [{ id: 1, content: "{{a}}-{{site}}", variables: { a: "1" } }],
      config: [{ config_key: "site", config_value: "2" }],
    });
    const page = await pages.getPageBySlug("p");
    // pass 1 resolves {{a}} from section vars -> "1-{{site}}"; pass 2 resolves
    // {{site}} from config -> "1-2".
    expect(page.sections[0].content).toBe("1-2");
    expect(page.body_content).toBe("1-2");
  });

  it("parses section variables supplied as a JSON string", async () => {
    setupDb({
      pages: [{ id: 1, slug: "p", template_content: "{{content}}" }],
      sections: [{ id: 1, content: "{{a}}", variables: '{"a":"json"}' }],
      config: [],
    });
    const page = await pages.getPageBySlug("p");
    expect(page.sections[0].content).toBe("json");
  });

  it("strips variables left unresolved after both passes", async () => {
    setupDb({
      pages: [{ id: 1, slug: "p", template_content: "{{content}}" }],
      sections: [{ id: 1, content: "[{{gone}}]", variables: {} }],
      config: [],
    });
    const page = await pages.getPageBySlug("p");
    // {{gone}} is in neither section vars nor config, so the stripUnresolved
    // second pass removes it rather than leaking a literal placeholder.
    expect(page.sections[0].content).toBe("[]");
  });

  it("substitutes and strips header/footer content from config", async () => {
    setupDb({
      pages: [
        {
          id: 1,
          slug: "p",
          template_content: "{{content}}",
          header_content: "<h>{{brand}}{{missing}}</h>",
          footer_content: "<f>{{brand}}</f>",
        },
      ],
      sections: [],
      config: [{ config_key: "brand", config_value: "Glow" }],
    });
    const page = await pages.getPageBySlug("p");
    expect(page.header_content).toBe("<h>Glow</h>");
    expect(page.footer_content).toBe("<f>Glow</f>");
  });

  it("leaves null header/footer content untouched", async () => {
    setupDb({
      pages: [{ id: 1, slug: "p", template_content: "{{content}}", header_content: null, footer_content: null }],
      sections: [],
      config: [],
    });
    const page = await pages.getPageBySlug("p");
    expect(page.header_content).toBeNull();
    expect(page.footer_content).toBeNull();
  });
});

describe("getContentPath", () => {
  it("normalizes a bare prefix to a leading slash", async () => {
    setupDb({ contentPath: "blog" });
    expect(await pages.getContentPath()).toBe("/blog");
  });

  it("preserves an already-absolute prefix", async () => {
    setupDb({ contentPath: "/blog" });
    expect(await pages.getContentPath()).toBe("/blog");
  });

  it("treats empty and root values as no prefix", async () => {
    setupDb({ contentPath: "" });
    expect(await pages.getContentPath()).toBe("");
    setupDb({ contentPath: "/" });
    expect(await pages.getContentPath()).toBe("");
  });

  it("returns no prefix when the config row is absent", async () => {
    setupDb({});
    expect(await pages.getContentPath()).toBe("");
  });
});

describe("resolvePageSlug", () => {
  it("joins segments when there is no content path", () => {
    expect(pages.resolvePageSlug(["a", "b"], "")).toBe("a/b");
  });

  it("returns null for an empty slug with no content path", () => {
    expect(pages.resolvePageSlug([], "")).toBeNull();
  });

  it("strips the content path prefix", () => {
    expect(pages.resolvePageSlug(["blog", "a", "b"], "/blog")).toBe("a/b");
  });

  it("returns null when the URL bare-matches the prefix with nothing after it", () => {
    expect(pages.resolvePageSlug(["blog"], "/blog")).toBeNull();
  });

  it("returns null when the URL does not start with the configured prefix", () => {
    expect(pages.resolvePageSlug(["other", "x"], "/blog")).toBeNull();
  });
});
