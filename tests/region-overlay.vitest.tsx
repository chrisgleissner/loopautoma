import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RegionOverlay } from "../src/components/RegionOverlay";
import * as tauriBridge from "../src/tauriBridge";

// Mock Tauri window API
const mockClose = vi.fn();
const mockOuterPosition = vi.fn();
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: mockClose,
    outerPosition: mockOuterPosition,
  }),
}));

// Mock tauriBridge functions
vi.mock("../src/tauriBridge", async () => {
  const actual = await vi.importActual("../src/tauriBridge");
  return {
    ...actual,
    regionPickerComplete: vi.fn(),
    regionPickerCancel: vi.fn(),
  };
});

describe("RegionOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOuterPosition.mockResolvedValue({ x: 100, y: 50 });
    vi.spyOn(tauriBridge, "regionPickerComplete").mockResolvedValue(undefined);
    vi.spyOn(tauriBridge, "regionPickerCancel").mockResolvedValue(undefined);
  });

  it("renders initial state with crosshair instructions", () => {
    render(<RegionOverlay />);
    expect(screen.getByText("Define watch region")).toBeInTheDocument();
    expect(screen.getByText("Click upper-left corner")).toBeInTheDocument();
  });

  it("displays selection rectangle when dragging", () => {
    const { container } = render(<RegionOverlay />);
    const overlay = container.querySelector(".region-overlay");
    expect(overlay).toBeInTheDocument();

    // Simulate pointer down (start drag)
    fireEvent.pointerDown(overlay!, { clientX: 10, clientY: 20, pointerId: 1 });
    
    // Status should update to "Release to confirm..." due to start being set
    expect(screen.getByText("Release to confirm lower-right corner")).toBeInTheDocument();

    // Simulate pointer move
    fireEvent.pointerMove(overlay!, { clientX: 100, clientY: 150, pointerId: 1 });

    // Selection rectangle should be visible
    const rect = container.querySelector(".region-overlay-rect");
    expect(rect).toBeInTheDocument();
    expect(rect).toHaveStyle({ left: "10px", top: "20px", width: "90px", height: "130px" });
  });

  it("calls regionPickerComplete on pointer up with correct global coordinates", async () => {
    const { container } = render(<RegionOverlay />);
    const overlay = container.querySelector(".region-overlay");

    // Wait for outerPosition to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Simulate full drag sequence
    fireEvent.pointerDown(overlay!, { clientX: 10, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(overlay!, { clientX: 100, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(overlay!, { clientX: 100, clientY: 150, pointerId: 1 });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify regionPickerComplete was called with scaled global coordinates
    expect(tauriBridge.regionPickerComplete).toHaveBeenCalledWith(
      { x: expect.any(Number), y: expect.any(Number) },
      { x: expect.any(Number), y: expect.any(Number) }
    );
    expect(mockClose).toHaveBeenCalled();
  });

  it("handles Escape key to cancel region picking", async () => {
    render(<RegionOverlay />);

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape" });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(tauriBridge.regionPickerCancel).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it("Cancel button triggers regionPickerCancel and closes window", async () => {
    render(<RegionOverlay />);

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(tauriBridge.regionPickerCancel).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it("handles regionPickerComplete error and displays message", async () => {
    const errorMsg = "Failed to complete region pick";
    vi.spyOn(tauriBridge, "regionPickerComplete").mockRejectedValue(new Error(errorMsg));

    const { container } = render(<RegionOverlay />);
    const overlay = container.querySelector(".region-overlay");

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Full drag sequence
    fireEvent.pointerDown(overlay!, { clientX: 10, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(overlay!, { clientX: 100, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(overlay!, { clientX: 100, clientY: 150, pointerId: 1 });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Error should be displayed
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });

  it("updates status when dragging starts", () => {
    const { container } = render(<RegionOverlay />);
    const overlay = container.querySelector(".region-overlay");

    expect(screen.getByText("Click upper-left corner")).toBeInTheDocument();

    fireEvent.pointerDown(overlay!, { clientX: 10, clientY: 20, pointerId: 1 });

    expect(screen.queryByText("Click upper-left corner")).not.toBeInTheDocument();
    expect(screen.getByText("Release to confirm lower-right corner")).toBeInTheDocument();
  });

  it("ignores pointer events on HUD elements", () => {
    const { container } = render(<RegionOverlay />);
    const hud = container.querySelector(".region-overlay-hud");
    expect(hud).toBeInTheDocument();

    // Click on HUD should not start drag
    fireEvent.pointerDown(hud!, { clientX: 10, clientY: 20, pointerId: 1 });

    // No selection rectangle should appear
    const rect = container.querySelector(".region-overlay-rect");
    expect(rect).not.toBeInTheDocument();
  });

  it("converts drag coordinates to CSS rect correctly for reversed drag", () => {
    const { container } = render(<RegionOverlay />);
    const overlay = container.querySelector(".region-overlay");

    // Drag from bottom-right to top-left (reversed)
    fireEvent.pointerDown(overlay!, { clientX: 100, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(overlay!, { clientX: 10, clientY: 20, pointerId: 1 });

    const rect = container.querySelector(".region-overlay-rect");
    expect(rect).toBeInTheDocument();
    // Should normalize to top-left origin
    expect(rect).toHaveStyle({ left: "10px", top: "20px", width: "90px", height: "130px" });
  });
});
