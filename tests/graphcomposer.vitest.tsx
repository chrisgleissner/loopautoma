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
    // presence checks via query
  expect(screen.getAllByText(/Trigger/).length >= 1).toBe(true);
  expect(screen.getAllByText(/Condition/).length >= 1).toBe(true);
  expect(screen.getAllByText(/Action Sequence/).length >= 1).toBe(true);

    const addBtn = screen.getByText("+ Add Action");
    fireEvent.click(addBtn);
    expect(p.actions.length >= 1).toBe(true);
  });

  it("updates trigger and condition via selects and editors", () => {
    const Wrapper = () => {
      const [p, setP] = useState(defaultPresetProfile());
      return <GraphComposer profile={p} onChange={setP as any} />;
    };
    render(<Wrapper />);

    const triggerSelect = screen.getByTitle(/Choose how often/i) as HTMLSelectElement;
    fireEvent.change(triggerSelect, { target: { value: "IntervalTrigger" } });
    const intervalInput = screen.getByLabelText(/Check interval/i) as HTMLInputElement;
    fireEvent.change(intervalInput, { target: { value: "2.5" } });
    expect(intervalInput.value).toBe("2.5");

    const conditionSelect = screen.getByTitle(/RegionCondition detects/i) as HTMLSelectElement;
    fireEvent.change(conditionSelect, { target: { value: "RegionCondition" } });
    const downscaleInput = screen.getByLabelText(/Downscale/i) as HTMLInputElement;
    fireEvent.change(downscaleInput, { target: { value: "8" } });
    expect(downscaleInput.value).toBe("8");
  });
});
