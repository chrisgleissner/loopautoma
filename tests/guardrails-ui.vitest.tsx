import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../src/App";
import * as bridge from "../src/tauriBridge";
import { defaultPresetProfile, ProfilesConfig } from "../src/types";

describe("Guardrails UI", () => {
  it("edits guardrails and persists via profilesSave", async () => {
    const preset = defaultPresetProfile();
    const loadSpy = vi.spyOn(bridge, "profilesLoad").mockResolvedValue({ version: 1, profiles: [preset] });
    const saveSpy = vi.spyOn(bridge, "profilesSave").mockResolvedValue();
    vi.spyOn(bridge, "monitorStart").mockResolvedValue();
    vi.spyOn(bridge, "monitorStop").mockResolvedValue();
    vi.spyOn(bridge, "captureRegionThumbnail").mockResolvedValue(null);

    render(<App />);
    const cooldown = await screen.findByLabelText(/Cooldown \(s\)/);
    fireEvent.change(cooldown, { target: { value: "1.5" } });
    const maxrt = await screen.findByLabelText(/Max runtime \(s\)/);
    fireEvent.change(maxrt, { target: { value: "9999" } });
    const maxact = await screen.findByLabelText(/Max activations\/hour/);
    fireEvent.change(maxact, { target: { value: "77" } });

    // Wait for all async profilesSave calls to complete (at least 1, up to 3 due to batching)
    await waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 2000 });

    // Wait a bit more to ensure final state is persisted
    await waitFor(() => {
      const lastCall = saveSpy.mock.calls[saveSpy.mock.calls.length - 1];
      const lastConfig = lastCall[0] as ProfilesConfig;
      const lastProfile = lastConfig.profiles.find((p) => p.id === preset.id);
      return lastProfile?.guardrails?.max_runtime_ms === 9999000;
    }, { timeout: 2000 });

    const lastCall = saveSpy.mock.calls[saveSpy.mock.calls.length - 1];
    const lastConfig = lastCall[0] as ProfilesConfig;
    const lastProfile = lastConfig.profiles.find((p) => p.id === preset.id)!;
    expect(lastProfile.guardrails?.cooldown_ms).toBe(1500);
    expect(lastProfile.guardrails?.max_runtime_ms).toBe(9999000);
    expect(lastProfile.guardrails?.max_activations_per_hour).toBe(77);

    loadSpy.mockRestore();
    saveSpy.mockRestore();
  });
});
