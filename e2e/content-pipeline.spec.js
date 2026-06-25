// End-to-end smoke test for the full content pipeline:
//
//   mint session → create header/footer/section-type/template
//   → generate section HTML via the (stubbed) LLM → create a published page
//   → fetch the public page and assert it is a complete, leak-free landing page.
//
// This ports the proven `data/bootstrap-content-*` flow into a maintained test.
// It runs entirely over HTTP against a real `next start` server (see
// playwright.config.js) with a stubbed LLM and a disposable, pre-seeded DB
// (see e2e/global-setup.js), so it is fast, offline, and needs no real keys.

import { test, expect } from "@playwright/test";
import { mintSessionCookieHeader } from "./helpers/session.js";
import { TEST_SITE_CONFIG } from "./helpers/env.js";

const JSON_HEADERS = { "content-type": "application/json" };

let cookie;

test.beforeAll(async () => {
  cookie = await mintSessionCookieHeader();
});

// Helper: an authenticated JSON POST/PUT carrying the minted session cookie.
function authedHeaders() {
  return { ...JSON_HEADERS, cookie };
}

test("authenticated content pipeline renders a complete, leak-free public page", async ({ request }) => {
  const stamp = Date.now();
  const slug = `e2e-smoke-${stamp}`;
  const metaTitle = `E2E Smoke ${stamp} — Glow E2E`;
  const metaDescription = "Deterministic end-to-end smoke test landing page.";

  // 1. Generate section HTML via the stubbed LLM. Proves the generate endpoint
  //    works end-to-end and returns clean, fence-free, placeholder-free HTML.
  const genRes = await request.post("/api/generate", {
    headers: authedHeaders(),
    data: {
      provider: "gemini",
      prompt: "Hero section for a skincare clinic landing page",
      currentHtml: "",
      objectType: "section",
    },
  });
  expect(genRes.status(), await genRes.text()).toBe(200);
  const { html: generatedHtml } = await genRes.json();
  expect(generatedHtml).toContain("<section");
  expect(generatedHtml).not.toContain("{{");
  expect(generatedHtml).not.toContain("```");

  // 2. Header + footer. Header references {{site_title}} (defined in site_config
  //    → must resolve); footer uses a literal CTA href (no dead links).
  const headerId = await createResource(request, "/api/headers", {
    name: "E2E Header",
    content: '<header class="site-header"><a href="/">{{site_title}}</a></header>',
  });
  const footerId = await createResource(request, "/api/footers", {
    name: "E2E Footer",
    content:
      '<footer class="site-footer"><p>© {{site_title}} clinic</p>' +
      '<a href="https://example.com/privacy">Privacy</a></footer>',
  });

  // 3. Section type + page template ({{content}} is filled with assembled sections).
  const sectionTypeId = await createResource(request, "/api/section-types", {
    name: "E2E Hero",
    default_content: "<section><h2>Default hero</h2></section>",
    variables: [],
  });
  const templateId = await createResource(request, "/api/page-templates", {
    name: "E2E Template",
    content: '<main class="page-body">{{content}}</main>',
    header_id: headerId,
    footer_id: footerId,
  });

  // 4. Create the page (published) with the generated HTML as its section body.
  const pageId = await createResource(request, "/api/pages", {
    title: "E2E Smoke Page",
    slug,
    header_id: headerId,
    footer_id: footerId,
    page_template_id: templateId,
    status: "published",
    meta_title: metaTitle,
    meta_description: metaDescription,
    sections: [{ section_type_id: sectionTypeId, content: generatedHtml, variables: {} }],
  });
  expect(pageId).toBeTruthy();

  // 5. Fetch the public page at the content_path-prefixed URL.
  const publicUrl = `${TEST_SITE_CONFIG.content_path}/${slug}`;
  const pageRes = await request.get(publicUrl);
  expect(pageRes.status(), `GET ${publicUrl}`).toBe(200);
  const body = await pageRes.text();

  // SEO: per-page title + meta description present in the document head.
  expect(body).toContain(`<title>${escapeHtml(metaTitle)}</title>`);
  expect(body).toContain('name="description"');
  expect(body).toContain(escapeHtml(metaDescription));

  // Header rendered with {{site_title}} resolved to its configured value.
  expect(body).toContain("site-header");
  expect(body).toContain(TEST_SITE_CONFIG.site_title);

  // Footer rendered with its literal CTA intact.
  expect(body).toContain("site-footer");
  expect(body).toContain('href="https://example.com/privacy"');

  // Body content from the generated section is present.
  expect(body).toContain("page-body");
  expect(body).toContain("deterministic stub content");

  // Leak / dead-CTA checks run against the RENDERED MARKUP, with <script> and
  // <style> blocks stripped: Next's framework scripts (the RSC flight payload)
  // legitimately contain `{{`/`}}` from serialized JSON and minified CSS, which
  // are not template leaks. A real `{{var}}` leak would surface in the visible
  // header/body/footer HTML, which survives the strip.
  const visible = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  // ZERO unresolved template tokens in the rendered content.
  expect(visible).not.toContain("{{");
  expect(visible).not.toContain("}}");

  // ZERO dead CTAs: no empty, fragment-only, or placeholder hrefs.
  expect(visible).not.toMatch(/href="\s*"/);
  expect(visible).not.toMatch(/href="#"/);
  expect(visible).not.toContain('href="{{');
});

test("gated API rejects requests without a valid session", async ({ request }) => {
  // OAuth is configured in the test DB, so proxy.js must 401 an unauthenticated
  // write. This proves the auth gate the pipeline relies on is actually live.
  const res = await request.post("/api/headers", {
    headers: JSON_HEADERS,
    data: { name: "no-auth", content: "<header></header>" },
  });
  expect(res.status()).toBe(401);
});

// POST a resource with the session cookie and return its created id.
async function createResource(request, path, data) {
  const res = await request.post(path, { headers: authedHeaders(), data });
  expect(res.status(), `POST ${path}: ${await res.text()}`).toBe(201);
  const { id } = await res.json();
  return id;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
