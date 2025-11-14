import { describe, it, expect } from "vitest";
import { defaultPresetProfile } from "../src/types";

describe("Types and defaults", () => {
  it("defaultPresetProfile returns valid profile", () => {
    const profile = defaultPresetProfile();
    expect(profile.id).toBe("keep-agent-001");
    expect(profile.name).toBe("Copilot Keep-Alive");
    expect(profile.regions).toHaveLength(2);
    expect(profile.regions[0].id).toBe("chat-out");
    expect(profile.regions[1].id).toBe("progress");
    expect(profile.trigger.type).toBe("IntervalTrigger");
    expect(profile.trigger.check_interval_sec).toBeGreaterThan(0);
    expect(profile.condition.type).toBe("RegionCondition");
    expect(profile.condition.stable_ms).toBeGreaterThan(0);
    expect(profile.condition.downscale).toBeGreaterThan(0);
    expect(profile.actions).toBeDefined();
    expect(Array.isArray(profile.actions)).toBe(true);
  });

  it("preset profile has valid guardrails", () => {
    const profile = defaultPresetProfile();
    expect(profile.guardrails).toBeDefined();
    expect(profile.guardrails?.cooldown_ms).toBeGreaterThanOrEqual(0);
    if (profile.guardrails?.max_runtime_ms !== undefined) {
      expect(profile.guardrails.max_runtime_ms).toBeGreaterThan(0);
    }
    if (profile.guardrails?.max_activations_per_hour !== undefined) {
      expect(profile.guardrails.max_activations_per_hour).toBeGreaterThan(0);
    }
  });

  it("preset profile regions have valid rects", () => {
    const profile = defaultPresetProfile();
    for (const region of profile.regions) {
      expect(region.id).toBeTruthy();
      expect(region.rect.x).toBeGreaterThanOrEqual(0);
      expect(region.rect.y).toBeGreaterThanOrEqual(0);
      expect(region.rect.width).toBeGreaterThan(0);
      expect(region.rect.height).toBeGreaterThan(0);
    }
  });

  it("preset profile actions match expected schema", () => {
    const profile = defaultPresetProfile();
    for (const action of profile.actions) {
      expect(action.type).toBeTruthy();
      // Verify action has expected structure based on type
      if (action.type === "MoveCursor") {
        const a = action as any;
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
      } else if (action.type === "Click") {
        const a = action as any;
        expect(["Left", "Right", "Middle"]).toContain(a.button);
      } else if (action.type === "Type") {
        const a = action as any;
        expect(typeof a.text).toBe("string");
      } else if (action.type === "Key") {
        const a = action as any;
        expect(typeof a.key).toBe("string");
      }
    }
  });
});
