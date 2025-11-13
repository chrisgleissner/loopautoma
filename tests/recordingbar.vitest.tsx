import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecordingBar, toActions } from "../src/components/RecordingBar";

// Mock windowPosition to keep stable coordinates in tests
vi.mock("../src/tauriBridge", () => ({ windowPosition: async () => ({ x: 0, y: 0 }) }));

describe("RecordingBar", () => {
  it("toggles record/stop and saves click+key", async () => {
    const onSave = vi.fn();
    render(<RecordingBar onSave={onSave} />);

    const btn = screen.getByRole("button", { name: /Record/i });
  fireEvent.click(btn);
  // wait a microtask so effect installs listeners and windowPosition resolves
  await new Promise((r) => setTimeout(r, 0));

    // Simulate a click inside window
    fireEvent.mouseDown(window, { button: 0, clientX: 5, clientY: 7 });
    // Simulate typing 'a' then Enter
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "Enter" });

    // Stop
  const stopBtn = screen.getByRole("button", { name: /Stop/i });
    fireEvent.click(stopBtn);

    // Save
    const saveBtn = screen.getByRole("button", { name: /Save as ActionSequence/i });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const events = onSave.mock.calls[0][0];
    const actions = toActions(events);

  // Expect a MoveCursor to (5, 7) and a Click Left, plus a Key Enter
  expect(actions.find(a => (a as any).type === "MoveCursor" && (a as any).x === 5 && (a as any).y === 7)).toBeTruthy();
    expect(actions.find(a => (a as any).type === "Click" && (a as any).button === "Left")).toBeTruthy();
    expect(actions.find(a => (a as any).type === "Key" && (a as any).key === "Enter")).toBeTruthy();
  });
});
