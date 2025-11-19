import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { GraphComposer } from "../src/components/GraphComposer";
import { defaultPresetProfile } from "../src/types";
import { registerBuiltins } from "../src/plugins/builtins";

describe("GraphComposer", () => {
  beforeAll(() => registerBuiltins());

  it("renders and adds an action", () => {
    let p = defaultPresetProfile();
    const onChange = (next: any) => { p = next; };
    render(<GraphComposer profile={p} onChange={onChange} />);
    // presence checks for simplified UI (Phase 1)
    expect(screen.getByText(/Check Every/i)).toBeTruthy();
    expect(screen.getByText(/Trigger if/i)).toBeTruthy();
    expect(screen.getAllByText(/Action Sequence/).length >= 1).toBe(true);

    const addBtn = screen.getByLabelText(/Add action/i);
    fireEvent.click(addBtn);
    expect(p.actions.length >= 1).toBe(true);
  });

  it("updates trigger and condition via editors", () => {
    const Wrapper = () => {
      const [p, setP] = useState(defaultPresetProfile());
      return <GraphComposer profile={p} onChange={setP as any} />;
    };
    render(<Wrapper />);

    // Phase 1 simplified UI: no dropdowns, just editors
    const intervalLabel = screen.getByText(/Check interval/i);
    expect(intervalLabel).toBeTruthy();

    // Verify condition editor renders properly
    const triggerText = screen.getByText(/Trigger if/i);
    expect(triggerText).toBeTruthy();

    // Verify change/no change select exists
    const changeSelect = screen.getByTitle(/Trigger on change or no change/i) as HTMLSelectElement;
    expect(changeSelect).toBeTruthy();
    fireEvent.change(changeSelect, { target: { value: "a" } });
    expect(changeSelect.value).toBe("a");

    // Verify "change detected for" text exists
    expect(screen.getByText(/change detected for/i)).toBeTruthy();
    expect(screen.getByText(/check\(s\)/i)).toBeTruthy();
  });
});
