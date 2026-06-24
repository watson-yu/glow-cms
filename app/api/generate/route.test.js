import { describe, it, expect, vi, beforeEach } from "vitest";

// The generate route normalizes each provider's wire shape into
// { rawText, truncated, model } and then applies the shared empty-guard /
// fence-strip / truncation checks. These tests drive the real POST handler with
// the provider SDKs, DB, and auth all stubbed — no network, no MySQL — to lock
// in the per-provider response parsing for the well-formed, fenced, empty/
// refused, and truncated cases.

const { query, sdk } = vi.hoisted(() => ({
  query: vi.fn(),
  sdk: {
    openaiCreate: vi.fn(),
    claudeCreate: vi.fn(),
    geminiGenerate: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ default: { query } }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
}));

vi.mock("openai", () => ({
  default: class {
    constructor() {
      this.chat = { completions: { create: sdk.openaiCreate } };
    }
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      this.messages = { create: sdk.claudeCreate };
    }
  },
}));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: sdk.geminiGenerate };
    }
  },
}));

import { POST } from "./route.js";

function makeReq(body) {
  return { json: async () => body };
}

beforeEach(() => {
  query.mockReset();
  // A configured API key for getKey(); a prompt row for the system scope; an
  // empty result set for the generation_logs INSERT.
  query.mockImplementation(async (sql) => {
    if (sql.includes("system_config")) return [[{ config_value: "test-key" }]];
    if (sql.includes("FROM prompts")) return [[{ id: 1, version: 2, content: "sys" }]];
    return [[]];
  });
  sdk.openaiCreate.mockReset();
  sdk.claudeCreate.mockReset();
  sdk.geminiGenerate.mockReset();
});

// --- OpenAI -----------------------------------------------------------------

describe("POST /api/generate — OpenAI response parsing", () => {
  it("returns the HTML from a well-formed completion", async () => {
    sdk.openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "<div>ok</div>" }, finish_reason: "stop" }],
    });
    const res = await POST(makeReq({ provider: "openai", prompt: "go" }));
    expect(res.status).toBe(200);
    expect(res.body.html).toBe("<div>ok</div>");
  });

  it("strips a markdown code fence the model wrapped around the HTML", async () => {
    sdk.openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "```html\n<div>ok</div>\n```" }, finish_reason: "stop" }],
    });
    const res = await POST(makeReq({ provider: "openai", prompt: "go" }));
    expect(res.body.html).toBe("<div>ok</div>");
  });

  it("returns 500 when the completion is null (content-filtered / refused)", async () => {
    sdk.openaiCreate.mockResolvedValue({
      choices: [{ message: { content: null }, finish_reason: "content_filter" }],
    });
    const res = await POST(makeReq({ provider: "openai", prompt: "go" }));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/empty response/);
  });

  it("returns 502 when the output was truncated at the token budget", async () => {
    sdk.openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "<div>partial" }, finish_reason: "length" }],
    });
    const res = await POST(makeReq({ provider: "openai", prompt: "go" }));
    expect(res.status).toBe(502);
    expect(res.body.truncated).toBe(true);
    expect(res.body.error).toMatch(/truncated/);
  });
});

// --- Claude -----------------------------------------------------------------

describe("POST /api/generate — Claude response parsing", () => {
  it("returns the HTML from a well-formed message", async () => {
    sdk.claudeCreate.mockResolvedValue({
      content: [{ type: "text", text: "<p>hi</p>" }],
      stop_reason: "end_turn",
    });
    const res = await POST(makeReq({ provider: "claude", prompt: "go" }));
    expect(res.body.html).toBe("<p>hi</p>");
  });

  it("picks the first text block when a non-text block leads the content array", async () => {
    sdk.claudeCreate.mockResolvedValue({
      content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "<p>hi</p>" }],
      stop_reason: "end_turn",
    });
    const res = await POST(makeReq({ provider: "claude", prompt: "go" }));
    expect(res.body.html).toBe("<p>hi</p>");
  });

  it("returns 500 when there is no text block (refused)", async () => {
    sdk.claudeCreate.mockResolvedValue({ content: [], stop_reason: "end_turn" });
    const res = await POST(makeReq({ provider: "claude", prompt: "go" }));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/empty response/);
  });

  it("returns 502 when stop_reason is max_tokens", async () => {
    sdk.claudeCreate.mockResolvedValue({
      content: [{ type: "text", text: "<p>partial" }],
      stop_reason: "max_tokens",
    });
    const res = await POST(makeReq({ provider: "claude", prompt: "go" }));
    expect(res.status).toBe(502);
    expect(res.body.truncated).toBe(true);
  });
});

// --- Gemini -----------------------------------------------------------------

describe("POST /api/generate — Gemini response parsing", () => {
  it("returns the HTML from a well-formed candidate", async () => {
    sdk.geminiGenerate.mockResolvedValue({
      response: { text: () => "<section>x</section>", candidates: [{ finishReason: "STOP" }] },
    });
    const res = await POST(makeReq({ provider: "gemini", prompt: "go" }));
    expect(res.body.html).toBe("<section>x</section>");
  });

  it("returns 500 when .text() throws (blocked candidate)", async () => {
    sdk.geminiGenerate.mockResolvedValue({
      response: {
        text: () => {
          throw new Error("blocked");
        },
        candidates: [{ finishReason: "SAFETY" }],
      },
    });
    const res = await POST(makeReq({ provider: "gemini", prompt: "go" }));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/empty response/);
  });

  it("returns 502 when finishReason is MAX_TOKENS", async () => {
    sdk.geminiGenerate.mockResolvedValue({
      response: { text: () => "<section>partial", candidates: [{ finishReason: "MAX_TOKENS" }] },
    });
    const res = await POST(makeReq({ provider: "gemini", prompt: "go" }));
    expect(res.status).toBe(502);
    expect(res.body.truncated).toBe(true);
  });
});

// --- request guards & logging ----------------------------------------------

describe("POST /api/generate — request guards and logging", () => {
  it("returns 400 when the prompt is missing", async () => {
    const res = await POST(makeReq({ provider: "openai" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Prompt required/);
  });

  it("returns 400 when no API key is configured for the provider", async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes("system_config")) return [[]]; // no key row
      return [[]];
    });
    const res = await POST(makeReq({ provider: "openai", prompt: "go" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No API key/);
  });

  it("persists the cleaned HTML to generation_logs on success", async () => {
    sdk.openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "```html\n<div>ok</div>\n```" }, finish_reason: "stop" }],
    });
    await POST(makeReq({ provider: "openai", prompt: "go" }));
    const logCall = query.mock.calls.find((c) => c[0].includes("generation_logs"));
    expect(logCall).toBeTruthy();
    // response_html is the last bound parameter; it stores the fence-stripped HTML.
    expect(logCall[1][logCall[1].length - 1]).toBe("<div>ok</div>");
  });

  it("does not write a log row when the completion is empty", async () => {
    sdk.openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "" }, finish_reason: "stop" }],
    });
    await POST(makeReq({ provider: "openai", prompt: "go" }));
    const logCall = query.mock.calls.find((c) => c[0].includes("generation_logs"));
    expect(logCall).toBeUndefined();
  });
});
