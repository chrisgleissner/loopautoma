import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CountdownTimer } from "../src/components/CountdownTimer";
import * as eventBridge from "../src/eventBridge";

vi.mock("../src/eventBridge", () => ({
  subscribeEvent: vi.fn(),
}));

describe("CountdownTimer", () => {
  let mockUnsubscribe: () => void;
  let eventCallback: (event: any) => void;

  beforeEach(() => {
    mockUnsubscribe = vi.fn();
    eventCallback = () => {};
    
    vi.mocked(eventBridge.subscribeEvent).mockImplementation((_channel: string, callback: any) => {
      eventCallback = callback;
      return Promise.resolve(mockUnsubscribe);
    });
  });

  it("renders nothing when monitor is not running", () => {
    const { container } = render(<CountdownTimer />);
    expect(container.firstChild).toBeNull();
  });

  it("displays next check countdown after MonitorTick event", async () => {
    render(<CountdownTimer />);
    
    eventCallback({
      type: "MonitorTick",
      next_check_ms: 5000,
      cooldown_remaining_ms: 0,
      condition_met: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Next Check In")).toBeTruthy();
      expect(screen.getByText(/\d\.\ds/)).toBeTruthy(); // Matches 5.0s, 4.9s, etc.
    });
  });

  it("displays cooldown when present", async () => {
    render(<CountdownTimer />);
    
    eventCallback({
      type: "MonitorTick",
      next_check_ms: 2000,
      cooldown_remaining_ms: 8000,
      condition_met: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Cooldown")).toBeTruthy();
      expect(screen.getByText(/8\.\ds/)).toBeTruthy();
    });
  });

  it("displays action ready indicator when condition met and no cooldown", async () => {
    render(<CountdownTimer />);
    
    eventCallback({
      type: "MonitorTick",
      next_check_ms: 1000,
      cooldown_remaining_ms: 0,
      condition_met: true,
    });

    await waitFor(() => {
      expect(screen.getByText("Action Ready")).toBeTruthy();
      expect(screen.getByText("⚡ FIRING")).toBeTruthy();
    });
  });

  it("hides timer when monitor stops", async () => {
    render(<CountdownTimer />);
    
    // Start monitor
    eventCallback({
      type: "MonitorTick",
      next_check_ms: 3000,
      cooldown_remaining_ms: 0,
      condition_met: false,
    });

    await waitFor(() => expect(screen.getByText("Next Check In")).toBeTruthy());

    // Stop monitor
    eventCallback({
      type: "MonitorStateChanged",
      state: "Stopped",
    });

    await waitFor(() => expect(screen.queryByText("Next Check In")).toBeNull());
  });

  it("cleans up subscription on unmount", async () => {
    const { unmount } = render(<CountdownTimer />);
    await waitFor(() => expect(eventBridge.subscribeEvent).toHaveBeenCalled());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
