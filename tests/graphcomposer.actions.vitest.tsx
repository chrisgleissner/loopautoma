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

    // Add action (defaults to Click with x,y,button)
    fireEvent.click(screen.getByLabelText(/Add action/i));
    // Change X, Y, and Button inside first action list item
    const firstLi = screen.getAllByRole("listitem")[0];
    const scope = within(firstLi);
    const inputs = scope.getAllByRole("spinbutton") as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: "123" } });
    fireEvent.change(inputs[1], { target: { value: "456" } });
    // Adjust button to Right
    const buttonSelect = scope.getByLabelText(/Button/) as HTMLSelectElement;
    fireEvent.change(buttonSelect, { target: { value: "Right" } });
    // Verify button select reflects Right
    expect(buttonSelect.value).toBe("Right");

    // Add another action and remove it
    fireEvent.click(screen.getByLabelText(/Add action/i));
    // We added a second action; list should now have 2 items
    const itemsAfterAdd = screen.getAllByRole("list")[0].querySelectorAll("li");
    expect(itemsAfterAdd.length).toBe(2);
    const removeButtons = screen.getAllByRole("button", { name: /Remove this action/i });
    fireEvent.click(removeButtons[1]);
    const itemsAfterRemove = screen.getAllByRole("list")[0].querySelectorAll("li");
    expect(itemsAfterRemove.length).toBe(1);
  });

  it("preserves inline special key syntax in Type actions", () => {
    const Wrapper = () => {
      const [p, setP] = useState(() => {
        const d = defaultPresetProfile();
        return { ...d, actions: [{ type: "Type", text: "Hello {Key:Enter}" }] };
      });
      return <GraphComposer profile={p as any} onChange={setP as any} />;
    };
    render(<Wrapper />);

    // Verify inline syntax is preserved in the Type action editor
    const list = screen.getAllByRole("list")[0];
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBe(1);

    const typeInput = within(items[0]).getByLabelText(/Text/i) as HTMLTextAreaElement;
    expect(typeInput.value).toBe("Hello {Key:Enter}");

    // Verify the help text exists (shows inline syntax is supported)
    expect(screen.getByText(/\{Key:Enter\}/i)).toBeTruthy();
  });
});
