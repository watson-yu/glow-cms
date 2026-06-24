import { describe, expect, it } from "vitest";
import { injectContent, substituteVars } from "@/lib/template";

describe("injectContent", () => {
  it("preserves `$$` literals in the injected content (e.g. prices)", () => {
    expect(injectContent("<p>{{content}}</p>", "cost is $$5")).toBe(
      "<p>cost is $$5</p>"
    );
  });

  it("preserves `$&` and other `$`-sequences (e.g. jQuery/regex/templating)", () => {
    expect(injectContent("X {{content}} Y", "a $& b $` c $' d")).toBe(
      "X a $& b $` c $' d Y"
    );
  });

  it("replaces every {{content}} placeholder, not just the first", () => {
    expect(injectContent("{{content}}---{{content}}", "X")).toBe("X---X");
  });

  it("returns the template unchanged when there is no placeholder", () => {
    expect(injectContent("<p>hello</p>", "X")).toBe("<p>hello</p>");
  });

  it("passes through falsy templates untouched", () => {
    expect(injectContent("", "X")).toBe("");
    expect(injectContent(null, "X")).toBe(null);
  });
});

describe("substituteVars", () => {
  it("substitutes known variables", () => {
    expect(substituteVars("Hi {{name}}", { name: "Glow" })).toBe("Hi Glow");
  });

  it("keeps unresolved variables by default and strips them when asked", () => {
    expect(substituteVars("Hi {{name}}", {})).toBe("Hi {{name}}");
    expect(substituteVars("Hi {{name}}", {}, { stripUnresolved: true })).toBe(
      "Hi "
    );
  });

  it("does not resolve prototype keys off the prototype chain", () => {
    // `\w+` matches these tokens; a bare config[key] would leak Object internals
    // (e.g. the constructor function) instead of treating them as unresolved.
    expect(substituteVars("a {{constructor}} b", {})).toBe(
      "a {{constructor}} b"
    );
    expect(substituteVars("a {{__proto__}} b", {})).toBe("a {{__proto__}} b");
    expect(substituteVars("a {{prototype}} b", {})).toBe("a {{prototype}} b");
    expect(
      substituteVars("a {{constructor}} b", {}, { stripUnresolved: true })
    ).toBe("a  b");
  });

  it("still resolves an own key that happens to share a prototype name", () => {
    expect(substituteVars("v={{constructor}}", { constructor: "X" })).toBe(
      "v=X"
    );
  });
});
