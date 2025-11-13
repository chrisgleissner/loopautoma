import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
});
