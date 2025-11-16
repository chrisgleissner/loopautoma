import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { GraphComposer } from "../src/components/GraphComposer";
import { defaultPresetProfile } from "../src/types";
import { registerBuiltins } from "../src/plugins/builtins";

beforeAll(() => registerBuiltins());

describe("GraphComposer Clear All", () => {
  it("clears all actions and disables button", () => {
    const Wrapper = () => {
      const [p, setP] = useState(defaultPresetProfile());
      return <GraphComposer profile={p} onChange={setP as any} />;
    };
    render(<Wrapper />);

    // Ensure there are actions to start
    const listBefore = screen.getByRole("list");
    expect(listBefore.querySelectorAll("li").length).toBeGreaterThan(0);

    const clearBtn = screen.getByRole("button", { name: /Clear all actions/i });
    fireEvent.click(clearBtn);
    const listAfter = screen.getByRole("list");
    expect(listAfter.querySelectorAll("li").length).toBe(0);

    // Button should be disabled now
    expect((clearBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
