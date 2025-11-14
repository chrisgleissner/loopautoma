import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../src/App";

const tauriBridgeMocks = vi.hoisted(() => ({
  profilesLoad: vi.fn(),
  profilesSave: vi.fn(),
  monitorStart: vi.fn(),
  monitorStop: vi.fn(),
  monitorPanicStop: vi.fn(),
  startScreenStream: vi.fn(),
  stopScreenStream: vi.fn(),
  startInputRecording: vi.fn(),
  stopInputRecording: vi.fn(),
  windowPosition: vi.fn(),
  windowInfo: vi.fn(),
}));

vi.mock("../src/tauriBridge", () => tauriBridgeMocks);

const mockProfilesLoad = tauriBridgeMocks.profilesLoad;
const mockProfilesSave = tauriBridgeMocks.profilesSave;
const mockMonitorStart = tauriBridgeMocks.monitorStart;
const mockMonitorStop = tauriBridgeMocks.monitorStop;
const mockMonitorPanicStop = tauriBridgeMocks.monitorPanicStop;
const mockStartScreenStream = tauriBridgeMocks.startScreenStream;
const mockStopScreenStream = tauriBridgeMocks.stopScreenStream;
const mockStartInputRecording = tauriBridgeMocks.startInputRecording;
const mockStopInputRecording = tauriBridgeMocks.stopInputRecording;
const mockWindowPosition = tauriBridgeMocks.windowPosition;
const mockWindowInfo = tauriBridgeMocks.windowInfo;

// Mock Tauri event listener
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe("Monitor control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfilesLoad.mockReset().mockResolvedValue([]);
    mockProfilesSave.mockReset().mockResolvedValue(undefined);
    mockMonitorStart.mockReset().mockResolvedValue(undefined);
    mockMonitorStop.mockReset().mockResolvedValue(undefined);
    mockMonitorPanicStop.mockReset().mockResolvedValue(undefined);
    mockStartScreenStream.mockReset().mockResolvedValue(undefined);
    mockStopScreenStream.mockReset().mockResolvedValue(undefined);
    mockStartInputRecording.mockReset().mockResolvedValue(undefined);
    mockStopInputRecording.mockReset().mockResolvedValue(undefined);
    mockWindowPosition.mockReset().mockResolvedValue({ x: 0, y: 0 });
    mockWindowInfo.mockReset().mockResolvedValue({ x: 0, y: 0, scale: 1 });
  });

  it("loads profiles on mount", async () => {
    render(<App />);
    await waitFor(() => {
      expect(mockProfilesLoad).toHaveBeenCalled();
    });
  });

  it("creates default profile when none exist", async () => {
    mockProfilesLoad.mockResolvedValue([]);
    render(<App />);
    
    await waitFor(() => {
      expect(mockProfilesSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: "keep-agent-001",
            name: "Copilot Keep-Alive",
          }),
        ])
      );
    });
  });

  it("Start button is disabled when no profile selected", async () => {
    mockProfilesLoad.mockResolvedValue([]);
    render(<App />);
    
    await waitFor(() => {
      const startBtn = screen.queryByRole("button", { name: /^Start$/i }) as HTMLButtonElement | null;
      // Start button may not exist or be disabled initially
      if (startBtn) {
        expect(startBtn.disabled).toBe(true);
      }
    });
  });

  it("starts monitor when Start button clicked", async () => {
    const testProfile = {
      id: "test-1",
      name: "Test",
      regions: [],
      trigger: { type: "IntervalTrigger", interval_ms: 500 },
      condition: { type: "RegionCondition", stable_ms: 1000, downscale: 4 },
      actions: [],
    };
    mockProfilesLoad.mockResolvedValue([testProfile]);
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeTruthy();
    });
    
    const startBtn = screen.getByRole("button", { name: /^Start$/i });
    fireEvent.click(startBtn);
    
    await waitFor(() => {
      expect(mockMonitorStart).toHaveBeenCalledWith("test-1");
    });
  });

  it("stops monitor when Stop button clicked", async () => {
    const testProfile = {
      id: "test-1",
      name: "Test",
      regions: [],
      trigger: { type: "IntervalTrigger", interval_ms: 500 },
      condition: { type: "RegionCondition", stable_ms: 1000, downscale: 4 },
      actions: [],
    };
    mockProfilesLoad.mockResolvedValue([testProfile]);
    
    render(<App />);
    
    const startBtn = await screen.findByRole("button", { name: /^Start$/i });
    fireEvent.click(startBtn);

    await waitFor(() => expect(mockMonitorStart).toHaveBeenCalled());

    const stopBtn = await screen.findByRole("button", { name: /^Stop$/i });
    fireEvent.click(stopBtn);
    
    await waitFor(() => {
      expect(mockMonitorStop).toHaveBeenCalled();
    });
  });

  it("Panic Stop button is disabled when not running", async () => {
    mockProfilesLoad.mockResolvedValue([]);
    render(<App />);
    
    await waitFor(() => {
      const panicBtn = screen.getByRole("button", { name: /Panic Stop/i }) as HTMLButtonElement;
      expect(panicBtn.disabled).toBe(true);
    });
  });

  it("triggers panic stop when Panic Stop clicked", async () => {
    const testProfile = {
      id: "test-1",
      name: "Test",
      regions: [],
      trigger: { type: "IntervalTrigger", interval_ms: 500 },
      condition: { type: "RegionCondition", stable_ms: 1000, downscale: 4 },
      actions: [],
    };
    mockProfilesLoad.mockResolvedValue([testProfile]);
    
    render(<App />);
    
    const startBtn = await screen.findByRole("button", { name: /^Start$/i });
    fireEvent.click(startBtn);

    await waitFor(() => expect(mockMonitorStart).toHaveBeenCalled());

    await waitFor(() => {
      const panicBtn = screen.getByRole("button", { name: /Panic Stop/i }) as HTMLButtonElement;
      expect(panicBtn.disabled).toBe(false);
      fireEvent.click(panicBtn);
    });
    
    await waitFor(() => {
      expect(mockMonitorPanicStop).toHaveBeenCalled();
    });
  });

  it("shows Running indicator when monitor is active", async () => {
    const testProfile = {
      id: "test-1",
      name: "Test",
      regions: [],
      trigger: { type: "IntervalTrigger", interval_ms: 500 },
      condition: { type: "RegionCondition", stable_ms: 1000, downscale: 4 },
      actions: [],
    };
    mockProfilesLoad.mockResolvedValue([testProfile]);
    
    render(<App />);
    
    const startBtn = await screen.findByRole("button", { name: /^Start$/i });
    fireEvent.click(startBtn);

    await waitFor(() => expect(mockMonitorStart).toHaveBeenCalled());

    await waitFor(() => {
      expect(screen.getByText(/Running/)).toBeTruthy();
    });
  });
});
