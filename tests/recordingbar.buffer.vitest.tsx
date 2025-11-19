import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecordingBar } from "../src/components/RecordingBar";

const tauriBridgeMocks = vi.hoisted(() => ({
  actionRecorderShow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/tauriBridge", () => tauriBridgeMocks);

const mockActionRecorderShow = tauriBridgeMocks.actionRecorderShow;

beforeEach(() => {
  vi.clearAllMocks();
  mockActionRecorderShow.mockReset();
  mockActionRecorderShow.mockResolvedValue(undefined);
});

describe("RecordingBar", () => {
  it("opens Action Recorder window when clicking Record button", async () => {
    render(<RecordingBar />);

    const recordBtn = screen.getByRole("button", { name: /Record Actions/i });
    expect(recordBtn).toBeTruthy();

    fireEvent.click(recordBtn);

    await waitFor(() => expect(mockActionRecorderShow).toHaveBeenCalledTimes(1));
  });

  it("displays error message when action recorder fails to open", async () => {
    mockActionRecorderShow.mockRejectedValueOnce(new Error("Failed to open window"));

    render(<RecordingBar />);

    const recordBtn = screen.getByRole("button", { name: /Record Actions/i });
    fireEvent.click(recordBtn);

    await screen.findByRole("alert");
    expect(screen.getByText(/Failed to open window/i)).toBeTruthy();
  });
});
