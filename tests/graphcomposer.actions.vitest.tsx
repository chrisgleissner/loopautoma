import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import { GraphComposer } from "../src/components/GraphComposer";
import { defaultPresetProfile } from "../src/types";
import { registerBuiltins } from "../src/plugins/builtins";

// Ensure builtins are registered for editors and types
beforeAll(() => registerBuiltins());

describe("GraphComposer actions", () => {
  it("edits actions via editors and remove", () => {
    const Wrapper = () => {
      const [p, setP] = useState(() => {
        const d = defaultPresetProfile();
        return { ...d, actions: [] };
      });
      return <GraphComposer profile={p} onChange={setP as any} />;
    };
    render(<Wrapper />);

    // Add action (defaults to MoveCursor)
    fireEvent.click(screen.getByText("+ Add Action"));
  // Change X and Y inside first action list item
  const firstLi = screen.getAllByRole("listitem")[0];
  const scope = within(firstLi);
  const inputs = scope.getAllByRole("spinbutton") as HTMLInputElement[];
  fireEvent.change(inputs[0], { target: { value: "123" } });
  fireEvent.change(inputs[1], { target: { value: "456" } });
  // Can't access p directly; rely on UI staying in sync; save changes then switch type and check editor presence

    // Change type to Click and adjust button
    const typeSelect = screen.getAllByTitle("Change the action type")[0] as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "Click" } });
    const buttonSelect = screen.getByLabelText(/Button/) as HTMLSelectElement;
    fireEvent.change(buttonSelect, { target: { value: "Right" } });
  // Verify button select reflects Right
  const buttonSelectAfter = screen.getByLabelText(/Button/);
  expect((buttonSelectAfter as HTMLSelectElement).value).toBe("Right");

    // Add another action and remove it
    fireEvent.click(screen.getByText("+ Add Action"));
  // We added a second action; list should now have 2 items
  const itemsAfterAdd = screen.getAllByRole("list")[0].querySelectorAll("li");
  expect(itemsAfterAdd.length).toBe(2);
    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[1]);
    const itemsAfterRemove = screen.getAllByRole("list")[0].querySelectorAll("li");
    expect(itemsAfterRemove.length).toBe(1);
  });
});
