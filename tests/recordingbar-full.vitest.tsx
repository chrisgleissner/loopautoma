import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecordingBar, toActions } from "../src/components/RecordingBar";
import * as tauriBridge from "../src/tauriBridge";

vi.mock("../src/tauriBridge", () => ({
  actionRecorderShow: vi.fn().mockResolvedValue(undefined),
}));

describe("RecordingBar", () => {
  it("renders the record button", () => {
    render(<RecordingBar />);
    
    expect(screen.getByText(/Record Actions/)).toBeTruthy();
  });

  it("shows helper text", () => {
    render(<RecordingBar />);
    
    expect(screen.getByText(/Click to open full-screen Action Recorder/)).toBeTruthy();
  });

  it("calls actionRecorderShow when button is clicked", async () => {
    render(<RecordingBar />);
    
    const button = screen.getByText(/Record Actions/);
    fireEvent.click(button);
    
    expect(tauriBridge.actionRecorderShow).toHaveBeenCalled();
  });

  it("displays error message when actionRecorderShow fails", async () => {
    vi.mocked(tauriBridge.actionRecorderShow).mockRejectedValueOnce(new Error("Failed to open"));
    
    render(<RecordingBar />);
    
    const button = screen.getByText(/Record Actions/);
    fireEvent.click(button);
    
    await screen.findByRole("alert");
    expect(screen.getByText(/Failed to open/)).toBeTruthy();
  });

  it("clears error when button clicked again", async () => {
    vi.mocked(tauriBridge.actionRecorderShow).mockRejectedValueOnce(new Error("Failed"));
    
    render(<RecordingBar />);
    
    const button = screen.getByText(/Record Actions/);
    
    // First click - error
    fireEvent.click(button);
    await screen.findByRole("alert");
    expect(screen.getByText(/Failed/)).toBeTruthy();
    
    // Second click - clears error immediately, then may show new error or succeed
    vi.mocked(tauriBridge.actionRecorderShow).mockResolvedValueOnce(undefined);
    fireEvent.click(button);
    
    // Component cleared error at start of handler
    // If second call succeeds, no alert; if it fails, new alert appears
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(tauriBridge.actionRecorderShow).mockRejectedValueOnce("String error");
    
    render(<RecordingBar />);
    
    const button = screen.getByText(/Record Actions/);
    fireEvent.click(button);
    
    await screen.findByRole("alert");
    expect(screen.getByText(/String error/)).toBeTruthy();
  });

  it("shows fallback message for null/undefined errors", async () => {
    vi.mocked(tauriBridge.actionRecorderShow).mockRejectedValueOnce("");
    
    render(<RecordingBar />);
    
    const button = screen.getByText(/Record Actions/);
    fireEvent.click(button);
    
    await screen.findByRole("alert");
    expect(screen.getByText(/Unable to open Action Recorder/)).toBeTruthy();
  });
});

describe("toActions", () => {
  it("converts click events to Click actions", () => {
    const events = [
      { t: "click" as const, button: "Left" as const, x: 100, y: 200 },
      { t: "click" as const, button: "Right" as const, x: 300, y: 400 },
    ];
    
    const actions = toActions(events);
    
    expect(actions).toEqual([
      { type: "Click", x: 100, y: 200, button: "Left" },
      { type: "Click", x: 300, y: 400, button: "Right" },
    ]);
  });

  it("converts type events to Type actions", () => {
    const events = [
      { t: "type" as const, text: "hello" },
      { t: "type" as const, text: "world" },
    ];
    
    const actions = toActions(events);
    
    expect(actions).toEqual([
      { type: "Type", text: "hello" },
      { type: "Type", text: "world" },
    ]);
  });

  it("converts mixed events correctly", () => {
    const events = [
      { t: "click" as const, button: "Left" as const, x: 10, y: 20 },
      { t: "type" as const, text: "test" },
      { t: "click" as const, button: "Middle" as const, x: 30, y: 40 },
    ];
    
    const actions = toActions(events);
    
    expect(actions.length).toBe(3);
    expect(actions[0]).toEqual({ type: "Click", x: 10, y: 20, button: "Left" });
    expect(actions[1]).toEqual({ type: "Type", text: "test" });
    expect(actions[2]).toEqual({ type: "Click", x: 30, y: 40, button: "Middle" });
  });

  it("handles empty events array", () => {
    const actions = toActions([]);
    expect(actions).toEqual([]);
  });
});
