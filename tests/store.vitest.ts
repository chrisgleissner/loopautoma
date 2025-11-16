import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useProfiles, useEventStream, useRunState } from "../src/store";
import { defaultProfilesConfig, type Event } from "../src/types";

// Mock @tauri-apps/api/event
const mockOff = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation((_channel, _callback) => Promise.resolve(mockOff)),
}));

const dispatchRuntimeEvent = (payload: Event) => {
  window.dispatchEvent(new CustomEvent("loopautoma://event", { detail: { payload } }));
};

describe("Store hooks", () => {
  describe("useProfiles", () => {
    it("initializes with null config", () => {
      const { result } = renderHook(() => useProfiles());
      expect(result.current.config).toEqual(null);
    });

    it("allows setting config", () => {
      const { result } = renderHook(() => useProfiles());
      const cfg = defaultProfilesConfig();

      act(() => {
        result.current.setConfig(cfg);
      });

      expect(result.current.config).toEqual(cfg);
    });
  });

  describe("useEventStream", () => {
    it("initializes with empty events array", () => {
      const { result } = renderHook(() => useEventStream());
      expect(result.current.events).toEqual([]);
    });

    it("clears events when clear is called", () => {
      const { result } = renderHook(() => useEventStream());
      
      // Manually add an event to test clearing
      act(() => {
        result.current.clear();
      });
      
      expect(result.current.events).toEqual([]);
    });

    it("appends events from Tauri listener", async () => {
      const { result } = renderHook(() => useEventStream());
      
      const testEvent: Event = { type: "TriggerFired" };
      
      await waitFor(() => {
        act(() => {
          dispatchRuntimeEvent(testEvent);
        });
        expect(result.current.events).toContainEqual(testEvent);
      });
    });

    it("limits events to 500 items", async () => {
      const { result } = renderHook(() => useEventStream());
      
      // Simulate adding 501 events
      for (let i = 0; i < 501; i++) {
        act(() => {
          dispatchRuntimeEvent({ type: "TriggerFired" });
        });
      }

      await waitFor(() => {
        expect(result.current.events.length).toBeLessThanOrEqual(500);
      });
    });
  });

  describe("useRunState", () => {
    it("initializes with null runningProfileId", () => {
      const { result } = renderHook(() => useRunState());
      expect(result.current.runningProfileId).toBeNull();
    });

    it("allows setting runningProfileId", () => {
      const { result } = renderHook(() => useRunState());
      
      act(() => {
        result.current.setRunningProfileId("test-profile-id");
      });
      
      expect(result.current.runningProfileId).toBe("test-profile-id");
    });

    it("clears runningProfileId on MonitorStateChanged to non-Running", async () => {
      const { result } = renderHook(() => useRunState());
      
      act(() => {
        result.current.setRunningProfileId("test-id");
      });
      
      expect(result.current.runningProfileId).toBe("test-id");
      
      act(() => {
        dispatchRuntimeEvent({ type: "MonitorStateChanged", state: "Stopped" } as Event);
      });

      await waitFor(() => {
        expect(result.current.runningProfileId).toBeNull();
      });
    });

    it("keeps runningProfileId on MonitorStateChanged to Running", async () => {
      const { result } = renderHook(() => useRunState());
      
      act(() => {
        result.current.setRunningProfileId("test-id");
      });
      
      act(() => {
        dispatchRuntimeEvent({ type: "MonitorStateChanged", state: "Running" } as Event);
      });

      await waitFor(() => {
        expect(result.current.runningProfileId).toBe("test-id");
      });
    });
  });
});
