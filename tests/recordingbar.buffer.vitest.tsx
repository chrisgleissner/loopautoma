import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecordingBar, toActions } from "../src/components/RecordingBar";

vi.mock("../src/tauriBridge", () => ({ windowPosition: async () => ({ x: 0, y: 0 }) }));

describe("RecordingBar buffer", () => {
  it("coalesces typed characters and flushes on stop", async () => {
    const onSave = vi.fn();
    render(<RecordingBar onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: /Record/i }));
    await new Promise((r) => setTimeout(r, 0));

    fireEvent.keyDown(window, { key: "h" });
    fireEvent.keyDown(window, { key: "i" });
    // Stop (flush happens)
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    fireEvent.click(screen.getByRole("button", { name: /Save as ActionSequence/i }));

    const events = onSave.mock.calls[0][0];
    const actions = toActions(events);
    expect(actions.find(a => (a as any).type === "Type" && (a as any).text === "hi")).toBeTruthy();
  });
});
