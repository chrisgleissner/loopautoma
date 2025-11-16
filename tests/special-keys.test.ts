import { describe, it, expect } from "vitest";
import { containsInlineKeySyntax, splitInlineKeySyntax } from "../src/utils/specialKeys";

describe("special key helpers", () => {
  it("detects inline syntax", () => {
    expect(containsInlineKeySyntax("Hello {Key:Enter}")).toBe(true);
    expect(containsInlineKeySyntax("no markers")).toBe(false);
  });

  it("splits inline syntax into actions", () => {
    const actions = splitInlineKeySyntax("Hello {Key:Enter} world");
    expect(actions.length).toBe(3);
    expect(actions[0]).toEqual({ type: "Type", text: "Hello " });
    expect(actions[1]).toEqual({ type: "Key", key: "Enter" });
    expect(actions[2]).toEqual({ type: "Type", text: " world" });
  });
});
