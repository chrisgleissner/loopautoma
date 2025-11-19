import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RegionAuthoringPanel } from "../src/components/RegionAuthoringPanel";
import * as tauriBridge from "../src/tauriBridge";
import { Region } from "../src/types";
import { emitTestEvent } from "../src/eventBridge";

const emitRegionPick = async (payload: { rect: Region["rect"]; thumbnail_png_base64?: string | null }) => {
  await Promise.resolve();
  emitTestEvent("loopautoma://region_pick_complete", payload);
};

// Mock tauriBridge functions
vi.mock("../src/tauriBridge", async () => {
  const actual = await vi.importActual("../src/tauriBridge");
  return {
    ...actual,
    regionPickerShow: vi.fn(),
    captureRegionThumbnail: vi.fn(),
  };
});


describe("RegionAuthoringPanel", () => {
  const mockOnRegionAdd = vi.fn();
  const mockOnRegionRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(tauriBridge, "regionPickerShow").mockResolvedValue(undefined);
    vi.spyOn(tauriBridge, "captureRegionThumbnail").mockResolvedValue("mock-thumbnail-base64");
  });

  it("renders initial state with Define watch region button", () => {
    render(<RegionAuthoringPanel />);
    expect(screen.getByRole("button", { name: /Define watch region/i })).toBeInTheDocument();
  });

  it("disables Define button when disabled prop is true", () => {
    render(<RegionAuthoringPanel disabled={true} />);
    const button = screen.getByRole("button", { name: /Define watch region/i });
    expect(button).toBeDisabled();
  });

  it("button is disabled when disabled prop is true and doesn't call regionPickerShow", async () => {
    render(<RegionAuthoringPanel disabled={true} onRegionAdd={mockOnRegionAdd} />);
    const button = screen.getByRole("button", { name: /Define watch region/i }) as HTMLButtonElement;

    // Button should be disabled, so clicking does nothing
    expect(button.disabled).toBe(true);
    fireEvent.click(button);

    // regionPickerShow should not be called
    expect(tauriBridge.regionPickerShow).not.toHaveBeenCalled();
  });

  it("calls regionPickerShow when Define button clicked", async () => {
    render(<RegionAuthoringPanel onRegionAdd={mockOnRegionAdd} />);
    const button = screen.getByRole("button", { name: /Define watch region/i });

    fireEvent.click(button);

    await waitFor(() => {
      expect(tauriBridge.regionPickerShow).toHaveBeenCalled();
    });
  });

  it("displays overlay active message after launching", async () => {
    render(<RegionAuthoringPanel onRegionAdd={mockOnRegionAdd} />);
    const button = screen.getByRole("button", { name: /Define watch region/i });

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Overlay active — click and drag/)).toBeInTheDocument();
    });
  });

  it("handles regionPickerShow error and displays message", async () => {
    const errorMsg = "Failed to show overlay";
    vi.spyOn(tauriBridge, "regionPickerShow").mockRejectedValue(new Error(errorMsg));

    render(<RegionAuthoringPanel onRegionAdd={mockOnRegionAdd} />);
    const button = screen.getByRole("button", { name: /Define watch region/i });

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });

  it("displays pending region after region_pick_complete event", async () => {
    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await emitRegionPick({
      rect: { x: 10, y: 20, width: 100, height: 80 },
      thumbnail_png_base64: "thumbnail-data",
    });

    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect(screen.getByText(/Proposed region: x=10, y=20, w=100, h=80/)).toBeInTheDocument();
    });
  });

  it("allows editing region ID and name in pending draft", async () => {
    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await emitRegionPick({ rect: { x: 10, y: 20, width: 100, height: 80 } });

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

    await emitRegionPick({ rect: { x: 10, y: 20, width: 100, height: 80 } });

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

    await emitRegionPick({ rect: { x: 10, y: 20, width: 100, height: 80 } });

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

    const removeButtons = screen.getAllByRole("button", { name: /Remove region/i });
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
      expect(screen.getByRole("button", { name: /Refresh thumbnail/i })).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole("button", { name: /Refresh thumbnail/i });
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
      expect(screen.getByRole("button", { name: /Refresh thumbnail/i })).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole("button", { name: /Refresh thumbnail/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Refreshing thumbnail/i })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Refresh thumbnail/i })).toBeInTheDocument();
    }, { timeout: 200 });
  });

  it("handles captureRegionThumbnail error gracefully", async () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 10, y: 20, width: 100, height: 80 } },
    ];

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
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

    await emitRegionPick({ rect: { x: 10, y: 20, width: 100, height: 80 } });

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

    const removeButton = screen.getByRole("button", { name: /Remove region/i });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });

  it("generates unique region IDs when adding multiple regions", async () => {
    const addedRegions: Region[] = [];
    const mockAdd = vi.fn((region: Region) => {
      addedRegions.push(region);
      return Promise.resolve();
    });

    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockAdd} />);

    // Add first region
    await emitRegionPick({ rect: { x: 10, y: 20, width: 100, height: 80 } });
    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockAdd} />);
    
    await waitFor(() => expect(screen.getByText("Add region to profile")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add region to profile"));
    
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));

    // Add second region
    await emitRegionPick({ rect: { x: 50, y: 60, width: 120, height: 90 } });
    rerender(<RegionAuthoringPanel regions={addedRegions} onRegionAdd={mockAdd} />);
    
    await waitFor(() => expect(screen.getByText("Add region to profile")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add region to profile"));
    
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(2));

    // Check that IDs are different
    expect(addedRegions[0].id).not.toBe(addedRegions[1].id);
  });

  it("displays bounding box details for existing regions", () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 100, y: 200, width: 300, height: 400 }, name: "Test Region" },
    ];

    render(<RegionAuthoringPanel regions={regions} />);

    expect(screen.getByText(/\(100, 200\)/)).toBeInTheDocument();
    expect(screen.getByText(/300×400/)).toBeInTheDocument();
  });

  it("allows multiple regions with different coordinates", () => {
    const regions: Region[] = [
      { id: "region-1", rect: { x: 0, y: 0, width: 50, height: 50 }, name: "Top-left" },
      { id: "region-2", rect: { x: 1920, y: 1080, width: 100, height: 100 }, name: "Bottom-right" },
    ];

    render(<RegionAuthoringPanel regions={regions} onRegionRemove={mockOnRegionRemove} />);

    expect(screen.getByText("Top-left")).toBeInTheDocument();
    expect(screen.getByText("Bottom-right")).toBeInTheDocument();
    expect(screen.getByText(/\(0, 0\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(1920, 1080\)/)).toBeInTheDocument();
  });

  it("handles regions with minimal dimensions", async () => {
    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await emitRegionPick({ rect: { x: 10, y: 10, width: 1, height: 1 } });

    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    await waitFor(() => {
      expect(screen.getByText(/w=1, h=1/)).toBeInTheDocument();
    });
  });

  it("clears error message after successful region add", async () => {
    const { rerender } = render(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);

    // First trigger an error
    mockOnRegionAdd.mockRejectedValueOnce(new Error("First error"));
    
    await emitRegionPick({ rect: { x: 10, y: 20, width: 100, height: 80 } });
    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);
    
    await waitFor(() => expect(screen.getByText("Add region to profile")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add region to profile"));
    
    await waitFor(() => expect(screen.getByText("First error")).toBeInTheDocument());

    // Now succeed
    mockOnRegionAdd.mockResolvedValueOnce(undefined);
    
    await emitRegionPick({ rect: { x: 50, y: 60, width: 120, height: 90 } });
    rerender(<RegionAuthoringPanel regions={[]} onRegionAdd={mockOnRegionAdd} />);
    
    await waitFor(() => expect(screen.getByText("Add region to profile")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add region to profile"));
    
    await waitFor(() => {
      expect(screen.queryByText("First error")).not.toBeInTheDocument();
    });
  });
});
