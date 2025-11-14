import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecordingBar, toActions } from "../src/components/RecordingBar";
import type { InputEvent } from "../src/types";

const tauriBridgeMocks = vi.hoisted(() => ({
  startInputRecording: vi.fn(),
  stopInputRecording: vi.fn(),
  windowPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
  windowInfo: vi.fn().mockResolvedValue({ x: 0, y: 0, scale: 1 }),
}));

vi.mock("../src/tauriBridge", () => tauriBridgeMocks);

const mockStartInputRecording = tauriBridgeMocks.startInputRecording;
const mockStopInputRecording = tauriBridgeMocks.stopInputRecording;

const inputListeners: Array<(payload: { payload: InputEvent }) => void> = [];

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation((_name, handler) => {
    inputListeners.push(handler);
    return Promise.resolve(() => {});
  }),
}));

const emitInputEvent = (event: InputEvent) => {
  inputListeners.forEach((cb) => cb({ payload: event }));
};

const baseModifiers = { shift: false, control: false, alt: false, meta: false };

const emitKeyEvent = (state: "down" | "up", key: string, text?: string | null) => {
  emitInputEvent({
    kind: "keyboard",
    keyboard: {
      state,
      key,
      code: 0,
      text,
      modifiers: baseModifiers,
      timestamp_ms: Date.now(),
    },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStartInputRecording.mockReset();
  mockStopInputRecording.mockReset();
  mockStartInputRecording.mockResolvedValue(undefined);
  mockStopInputRecording.mockResolvedValue(undefined);
  inputListeners.length = 0;
});

describe("RecordingBar buffer", () => {
  it("coalesces typed characters and flushes on stop", async () => {
    const onSave = vi.fn();
    render(<RecordingBar onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: /Record/i }));
    await waitFor(() => expect(mockStartInputRecording).toHaveBeenCalled());
    await screen.findByText(/Recording/i);

    emitKeyEvent("down", "h", "h");
    emitKeyEvent("down", "i", "i");

    const stopBtn = await screen.findByRole("button", { name: /Stop/i });
    fireEvent.click(stopBtn);
    await waitFor(() => expect(mockStopInputRecording).toHaveBeenCalled());

    const saveBtn = screen.getByRole("button", { name: /Save as ActionSequence/i }) as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const events = onSave.mock.calls[0][0];
    const actions = toActions(events);
    expect(actions.find(a => (a as any).type === "Type" && (a as any).text === "hi")).toBeTruthy();
  });
});
