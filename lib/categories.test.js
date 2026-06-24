import { describe, it, expect } from "vitest";
import { categoryLocalId, MYSQL_INT_MAX, L2_ID_MULTIPLIER } from "./categories.js";

describe("categoryLocalId", () => {
  it("maps parent_id and id into a single key", () => {
    expect(categoryLocalId(1, 42)).toBe(100042);
    expect(categoryLocalId(0, 5)).toBe(5);
    expect(categoryLocalId(20, 999)).toBe(2000999);
  });

  it("keeps sibling parents in disjoint ranges (no collision below the multiplier)", () => {
    // parent 1's largest valid slot is below parent 2's smallest slot.
    expect(categoryLocalId(1, L2_ID_MULTIPLIER - 1)).toBeLessThan(categoryLocalId(2, 0));
  });

  it("rejects treatment ids >= the multiplier (would collide with the next parent)", () => {
    expect(() => categoryLocalId(1, L2_ID_MULTIPLIER)).toThrow(/collide/);
    expect(() => categoryLocalId(1, L2_ID_MULTIPLIER + 1)).toThrow(/collide/);
  });

  it("accepts the largest parent_id that still fits in a signed INT", () => {
    // parent_id * 100000 + id must stay <= 2147483647.
    const maxParent = Math.floor((MYSQL_INT_MAX - 0) / L2_ID_MULTIPLIER); // 21474
    expect(categoryLocalId(maxParent, 0)).toBeLessThanOrEqual(MYSQL_INT_MAX);
  });

  it("rejects results that overflow MySQL signed INT", () => {
    // 21475 * 100000 = 2,147,500,000 > 2,147,483,647
    expect(() => categoryLocalId(21475, 0)).toThrow(/exceeds MySQL INT max/);
    // boundary: 21474 * 100000 + 99999 = 2,147,499,999 also overflows
    expect(() => categoryLocalId(21474, 99999)).toThrow(/exceeds MySQL INT max/);
  });

  it("rejects negative or non-integer ids", () => {
    expect(() => categoryLocalId(-1, 5)).toThrow(/Invalid category ids/);
    expect(() => categoryLocalId(1, -5)).toThrow(/Invalid category ids/);
    expect(() => categoryLocalId(1.5, 5)).toThrow(/Invalid category ids/);
    expect(() => categoryLocalId(1, "5")).toThrow(/Invalid category ids/);
  });
});
