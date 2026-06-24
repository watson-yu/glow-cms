import { describe, it, expect } from "vitest";
import {
  normalizeBaseUrl,
  getBaseUrl,
  pagePath,
  pageCanonical,
  buildPageMetadata,
} from "./seo.js";

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://x.com/")).toBe("https://x.com");
    expect(normalizeBaseUrl("https://x.com///")).toBe("https://x.com");
  });
  it("returns empty for falsy input", () => {
    expect(normalizeBaseUrl("")).toBe("");
    expect(normalizeBaseUrl(undefined)).toBe("");
  });
});

describe("getBaseUrl", () => {
  it("prefers config.base_url", () => {
    expect(getBaseUrl({ base_url: "https://glow.tw/" })).toBe("https://glow.tw");
  });
  it("falls back to a dev default", () => {
    expect(getBaseUrl({})).toBe("http://localhost:3000");
  });
});

describe("pagePath", () => {
  it("respects the content path prefix", () => {
    expect(pagePath("how-to", "/guides")).toBe("/guides/how-to");
  });
  it("works at the root when no prefix", () => {
    expect(pagePath("how-to", "")).toBe("/how-to");
  });
});

describe("pageCanonical", () => {
  const baseUrl = "https://glow.tw";
  it("derives canonical from slug + content path", () => {
    expect(pageCanonical({ slug: "botox", contentPath: "/guides", baseUrl })).toBe(
      "https://glow.tw/guides/botox"
    );
  });
  it("uses an explicit absolute canonical as-is", () => {
    expect(
      pageCanonical({ canonical: "https://other.com/x", slug: "botox", baseUrl })
    ).toBe("https://other.com/x");
  });
  it("resolves an explicit relative canonical against the base url", () => {
    expect(pageCanonical({ canonical: "/custom", slug: "botox", baseUrl })).toBe(
      "https://glow.tw/custom"
    );
  });
  it("returns a relative path when no base url is configured", () => {
    expect(pageCanonical({ slug: "botox", contentPath: "", baseUrl: "" })).toBe("/botox");
  });
});

describe("buildPageMetadata", () => {
  const baseUrl = "https://glow.tw";
  const config = { site_title: "Glow", logo_url: "/logo.png" };

  it("uses the SEO columns when present", () => {
    const page = {
      title: "Botox Page",
      slug: "botox",
      meta_title: "Botox in Taipei",
      meta_description: "All about botox",
      og_image: "https://cdn.tw/botox.jpg",
    };
    const md = buildPageMetadata({ page, config, contentPath: "/guides", baseUrl });
    expect(md.title).toBe("Botox in Taipei");
    expect(md.description).toBe("All about botox");
    expect(md.alternates.canonical).toBe("https://glow.tw/guides/botox");
    expect(md.openGraph.images).toEqual(["https://cdn.tw/botox.jpg"]);
    expect(md.openGraph.siteName).toBe("Glow");
  });

  it("falls back to the page title and config logo when SEO fields are empty", () => {
    const page = { title: "Botox Page", slug: "botox" };
    const md = buildPageMetadata({ page, config, contentPath: "", baseUrl });
    expect(md.title).toBe("Botox Page");
    expect(md.description).toBeUndefined();
    expect(md.alternates.canonical).toBe("https://glow.tw/botox");
    // og image falls back to the absolute-resolved logo
    expect(md.openGraph.images).toEqual(["https://glow.tw/logo.png"]);
  });

  it("falls back to the site name when there is no title at all", () => {
    const md = buildPageMetadata({ page: { slug: "x" }, config, baseUrl });
    expect(md.title).toBe("Glow");
  });
});
