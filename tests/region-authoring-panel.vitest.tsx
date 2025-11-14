import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RegionAuthoringPanel } from "../src/components/RegionAuthoringPanel";
import * as tauriBridge from "../src/tauriBridge";
import { Region } from "../src/types";

// Mock tauriBridge functions
vi.mock("../src/tauriBridge", async () => {
  const actual = await vi.importActual("../src/tauriBridge");
  return {
    ...actual,
    regionPickerShow: vi.fn(),
    captureRegionThumbnail: vi.fn(),
  };
});

// Mock Tauri event listener
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (eventName: string, callback: (event: any) => void) => {
    // Store callback for manual triggering in tests
    (global as any).__regionPickCallback = callback;
    return () => {};
  }),
}));

describe("RegionAuthoringPanel", () => {
  const mockOnRegionAdd = vi.fn();
  const mockOnRegionRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).__regionPickCallback;
    vi.spyOn(tauriBridge, "regionPickerShow").mockResolvedValue(undefined);
    vi.spyOn(tauriBridge, "captureRegionThumbnail").mockResolvedValue("mock-thumbnail-base64");
  });

  it("renders initial state with Define watch region button", () => {
    render(<RegionAuthoringPanel />);
    expect(screen.getByText("Define watch region")).toBeInTheDocument();
  });

  it("disables Define button when disabled prop is true", () => {
    render(<RegionAuthoringPanel disabled={true} />);
    const button = screen.getByText("Define watch region");
    expect(button).toBeDisabled();
  });

  it("button is disabled when disabled prop is true and doesn't call regionPickerShow", async () => {
    render(<RegionAuthoringPanel disabled={true} onRegionAdd={mockOnRegionAdd} />);
    const button = screen.getByText("Define watch region") as HTMLButtonElement;
    
    // Button should be disabled, so clicking does nothing
    expect(button.disabled).toBe(true);
    fireEvent.click(button);

    // regionPickerShow should not be called
    expect(tauriBridge.regionPickerShow).not.toHaveBeenCalled();
  });

  it("calls regionPickerShow when Define button clicked", async () => {
    render(<RegionAuthoringPanel onRegionAdd={mockOnRegionAdd} />);
    const button = screen.getByText("Define watch region");

    fireEvent.click(button);

    await waitFor(() => {
      expect(tauriBridge.regionPickerShow).toHaveBeenCalled();
    });
  });

  it("displays overlay active message after launching", async () => {
    render(<RegionAuthoringPanel onRegionAdd={mockOnRegionAdd} />);
    const button = screen.getByText("Define watch region");

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Overlay active — click and drag/)).toBeInTheDocument();
    });
  });

  it("handles regionPickerShow error and displays message", async () => {
    const errorMsg = "Failed to show overlay";
    vi.spyOn(tauriBridge, "regionPickerShow").mockRejectedValue(new Error(errorMsg));

    render(<RegionAuthoringPanel onRegionAdd={mockOnRegionAdd} />);
    const button = screen.getByText("Define watch region");

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });

  it("displays pending region after region_pick_complete event", async () => {
    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    // Wait for listen to be called
    await waitFor(() => {
      expect((global as any).__regionPickCallback).toBeDefined();
    });

    // Simulate region_pick_complete event
    const callback = (global as any).__regionPickCallback;
    callback({
      payload: {
        rect: { x: 10, y: 20, width: 100, height: 80 },
        thumbnail_png_base64: "thumbnail-data",
      },
    });

    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect(screen.getByText(/Proposed region: x=10, y=20, w=100, h=80/)).toBeInTheDocument();
    });
  });

  it("allows editing region ID and name in pending draft", async () => {
    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect((global as any).__regionPickCallback).toBeDefined();
    });

    const callback = (global as any).__regionPickCallback;
    callback({
      payload: {
        rect: { x: 10, y: 20, width: 100, height: 80 },
      },
    });

    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Region ID")).toBeInTheDocument();
    });

    const idInput = screen.getByLabelText("Region ID");
    const nameInput = screen.getByLabelText("Friendly name");

    fireEvent.change(idInput, { target: { value: "custom-region-id" } });
    fireEvent.change(nameInput, { target: { value: "My Custom Region" } });

    expect(idInput).toHaveValue("custom-region-id");
    expect(nameInput).toHaveValue("My Custom Region");
  });

  it("calls onRegionAdd with correct data when Add button clicked", async () => {
    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect((global as any).__regionPickCallback).toBeDefined();
    });

    const callback = (global as any).__regionPickCallback;
    callback({
      payload: {
        rect: { x: 10, y: 20, width: 100, height: 80 },
      },
    });

    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect(screen.getByText("Add region to profile")).toBeInTheDocument();
    });

    const idInput = screen.getByLabelText("Region ID");
    fireEvent.change(idInput, { target: { value: "test-region" } });

    const addButton = screen.getByText("Add region to profile");
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockOnRegionAdd).toHaveBeenCalledWith({
        rect: { x: 10, y: 20, width: 100, height: 80 },
        id: "test-region",
        name: "Region 1",
      });
    });
  });

  it("clears pending draft when Discard button clicked", async () => {
    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect((global as any).__regionPickCallback).toBeDefined();
    });

    const callback = (global as any).__regionPickCallback;
    callback({
      payload: {
        rect: { x: 10, y: 20, width: 100, height: 80 },
      },
    });

    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect(screen.getByText("Discard")).toBeInTheDocument();
    });

    const discardButton = screen.getByText("Discard");
    fireEvent.click(discardButton);

    await waitFor(() => {
      expect(screen.queryByText(/Proposed region:/)).not.toBeInTheDocument();
    });
  });

  it("renders existing regions in grid", () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 10, y: 20, width: 100, height: 80 }, name: "First Region" },
      { id: "region-2", rect: { x: 50, y: 60, width: 200, height: 150 }, name: "Second Region" },
    ];

    render(<RegionAuthoringPanel regions={regions} onRegionAdd={mockOnRegionAdd} onRegionRemove={mockOnRegionRemove} />);

    expect(screen.getByText("First Region")).toBeInTheDocument();
    expect(screen.getByText("Second Region")).toBeInTheDocument();
    expect(screen.getByText("region-1")).toBeInTheDocument();
    expect(screen.getByText("region-2")).toBeInTheDocument();
  });

  it("calls captureRegionThumbnail for existing regions on mount", async () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 10, y: 20, width: 100, height: 80 } },
    ];

    render(<RegionAuthoringPanel regions={regions} />);

    await waitFor(() => {
      expect(tauriBridge.captureRegionThumbnail).toHaveBeenCalledWith({ x: 10, y: 20, width: 100, height: 80 });
    });
  });

  it("calls onRegionRemove when Remove button clicked", async () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 10, y: 20, width: 100, height: 80 }, name: "Test Region" },
    ];

    render(<RegionAuthoringPanel regions={regions} onRegionRemove={mockOnRegionRemove} />);

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(mockOnRegionRemove).toHaveBeenCalledWith("region-1");
    });
  });

  it("refreshes thumbnail when Refresh button clicked", async () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 10, y: 20, width: 100, height: 80 }, name: "Test Region" },
    ];

    vi.spyOn(tauriBridge, "captureRegionThumbnail").mockResolvedValue("updated-thumbnail-base64");

    render(<RegionAuthoringPanel regions={regions} />);

    await waitFor(() => {
      expect(screen.getByText("Refresh thumbnail")).toBeInTheDocument();
    });

    const refreshButton = screen.getByText("Refresh thumbnail");
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(tauriBridge.captureRegionThumbnail).toHaveBeenCalledTimes(2); // Once on mount, once on refresh
    });
  });

  it("displays loading state while refreshing thumbnail", async () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 10, y: 20, width: 100, height: 80 }, name: "Test Region" },
    ];

    // Make captureRegionThumbnail slow
    vi.spyOn(tauriBridge, "captureRegionThumbnail").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve("thumbnail"), 100))
    );

    render(<RegionAuthoringPanel regions={regions} />);

    await waitFor(() => {
      expect(screen.getByText("Refresh thumbnail")).toBeInTheDocument();
    });

    const refreshButton = screen.getByText("Refresh thumbnail");
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(screen.getByText("Refreshing…")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Refresh thumbnail")).toBeInTheDocument();
    }, { timeout: 200 });
  });

  it("handles captureRegionThumbnail error gracefully", async () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 10, y: 20, width: 100, height: 80 } },
    ];

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(tauriBridge, "captureRegionThumbnail").mockRejectedValue(new Error("Capture failed"));

    render(<RegionAuthoringPanel regions={regions} />);

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith("thumbnail capture failed", expect.any(Error));
    });

    consoleWarnSpy.mockRestore();
  });

  it("displays placeholder when thumbnail not available", () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 10, y: 20, width: 100, height: 80 }, name: "Test Region" },
    ];

    vi.spyOn(tauriBridge, "captureRegionThumbnail").mockResolvedValue(null);

    render(<RegionAuthoringPanel regions={regions} />);

    expect(screen.getByText("No preview yet")).toBeInTheDocument();
  });

  it("handles onRegionAdd error and displays message", async () => {
    const errorMsg = "Failed to add region";
    mockOnRegionAdd.mockRejectedValue(new Error(errorMsg));

    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect((global as any).__regionPickCallback).toBeDefined();
    });

    const callback = (global as any).__regionPickCallback;
    callback({
      payload: {
        rect: { x: 10, y: 20, width: 100, height: 80 },
      },
    });

    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect(screen.getByText("Add region to profile")).toBeInTheDocument();
    });

    const addButton = screen.getByText("Add region to profile");
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });

  it("handles onRegionRemove error and displays message", async () => {
    const errorMsg = "Failed to remove region";
    mockOnRegionRemove.mockRejectedValue(new Error(errorMsg));

    const regions: Region[] = [
      { id: "region-1", rect: { x: 10, y: 20, width: 100, height: 80 }, name: "Test Region" },
    ];

    render(<RegionAuthoringPanel regions={regions} onRegionRemove={mockOnRegionRemove} />);

    const removeButton = screen.getByText("Remove");
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });
});
