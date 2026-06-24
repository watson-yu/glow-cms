import { describe, it, expect } from "vitest";
import { nextPromptVersion } from "./prompts.js";

describe("nextPromptVersion", () => {
  it("returns 1 when no versions exist (max 0)", () => {
    expect(nextPromptVersion(0)).toBe(1);
  });
  it("increments the current max", () => {
    expect(nextPromptVersion(1)).toBe(2);
    expect(nextPromptVersion(7)).toBe(8);
  });
  it("treats null/undefined/NaN as no versions", () => {
    expect(nextPromptVersion(null)).toBe(1);
    expect(nextPromptVersion(undefined)).toBe(1);
    expect(nextPromptVersion(NaN)).toBe(1);
  });
  it("never produces a non-positive version from junk input", () => {
    expect(nextPromptVersion(-5)).toBe(1);
  });
  it("truncates fractional maxes", () => {
    expect(nextPromptVersion(3.9)).toBe(4);
  });
});
