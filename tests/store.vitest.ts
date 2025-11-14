import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useProfiles, useEventStream, useRunState } from "../src/store";
import type { Event } from "../src/types";

// Mock @tauri-apps/api/event
const mockListener = vi.fn();
const mockOff = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation((_channel, callback) => {
    mockListener.mockImplementation(callback);
    return Promise.resolve(mockOff);
  }),
}));

describe("Store hooks", () => {
  describe("useProfiles", () => {
    it("initializes with empty profiles array", () => {
      const { result } = renderHook(() => useProfiles());
      expect(result.current.profiles).toEqual([]);
    });

    it("allows setting profiles", () => {
      const { result } = renderHook(() => useProfiles());
      const testProfiles = [
        {
          id: "test-1",
          name: "Test Profile",
          regions: [],
          trigger: { type: "IntervalTrigger", check_interval_sec: 60 },
          condition: { type: "RegionCondition", stable_ms: 1000, downscale: 4 },
          actions: [],
        },
      ];

      act(() => {
        result.current.setProfiles(testProfiles);
      });

      expect(result.current.profiles).toEqual(testProfiles);
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
          mockListener({ payload: testEvent });
        });
      });

      await waitFor(() => {
        expect(result.current.events).toContainEqual(testEvent);
      });
    });

    it("limits events to 500 items", async () => {
      const { result } = renderHook(() => useEventStream());
      
      // Simulate adding 501 events
      await waitFor(() => {
        for (let i = 0; i < 501; i++) {
          act(() => {
            mockListener({ payload: { type: "TriggerFired" } });
          });
        }
      });

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
      
      await waitFor(() => {
        act(() => {
          mockListener({ 
            payload: { 
              type: "MonitorStateChanged", 
              state: "Stopped" 
            } 
          });
        });
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
      
      await waitFor(() => {
        act(() => {
          mockListener({ 
            payload: { 
              type: "MonitorStateChanged", 
              state: "Running" 
            } 
          });
        });
      });

      await waitFor(() => {
        expect(result.current.runningProfileId).toBe("test-id");
      });
    });
  });
});
