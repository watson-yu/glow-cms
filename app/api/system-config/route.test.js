import { describe, it, expect, vi, beforeEach } from "vitest";

// The PUT handler persists each posted key to system_config. The contract
// (AGENT.md "Secret Masking") is that an empty/blank value for a secret key is
// skipped so a "Change" → Save with the box left empty preserves the stored
// secret instead of wiping it. These tests drive PUT with a stubbed pool/auth.

const { query } = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue([[], []]),
}));

vi.mock("@/lib/db", () => ({
  default: { query },
  saveDbConfig: vi.fn(),
  loadConfig: vi.fn(() => ({})),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue(null), // null = allowed
}));

vi.mock("next/server", () => ({
  NextResponse: { json: (body) => ({ body }) },
}));

import { PUT } from "./route.js";

function makeReq(data) {
  return { json: async () => data };
}

// Keys persisted to system_config (config_key) via the INSERT ... ON DUPLICATE.
function persistedKeys() {
  return query.mock.calls.map((c) => c[1][0]);
}

beforeEach(() => {
  query.mockClear();
});

describe("PUT /api/system-config — secret wipe protection", () => {
  it("skips persisting an empty secret value (preserves existing secret)", async () => {
    await PUT(makeReq({ openai_api_key: "" }));
    expect(persistedKeys()).not.toContain("openai_api_key");
  });

  it("skips a whitespace-only secret value", async () => {
    await PUT(makeReq({ aws_secret_key: "   " }));
    expect(persistedKeys()).not.toContain("aws_secret_key");
  });

  it("still persists a non-empty secret value", async () => {
    await PUT(makeReq({ claude_api_key: "sk-live-123" }));
    const call = query.mock.calls.find((c) => c[1][0] === "claude_api_key");
    expect(call).toBeTruthy();
    expect(call[1][1]).toBe("sk-live-123");
  });

  it("does not change non-secret behavior: empty non-secret values are still persisted", async () => {
    await PUT(makeReq({ site_title: "" }));
    const call = query.mock.calls.find((c) => c[1][0] === "site_title");
    expect(call).toBeTruthy();
    expect(call[1][1]).toBe("");
  });
});
