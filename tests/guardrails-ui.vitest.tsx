import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../src/App";
import * as bridge from "../src/tauriBridge";
import { defaultPresetProfile } from "../src/types";

describe("Guardrails UI", () => {
  it("edits guardrails and persists via profilesSave", async () => {
    const preset = defaultPresetProfile();
    const loadSpy = vi.spyOn(bridge, "profilesLoad").mockResolvedValue([preset]);
    const saveSpy = vi.spyOn(bridge, "profilesSave").mockResolvedValue();
    vi.spyOn(bridge, "monitorStart").mockResolvedValue();
    vi.spyOn(bridge, "monitorStop").mockResolvedValue();
    vi.spyOn(bridge, "captureRegionThumbnail").mockResolvedValue(null);

    render(<App />);
    const cooldown = await screen.findByLabelText(/Cooldown \(ms\)/);
    fireEvent.change(cooldown, { target: { value: "1234" } });
    const maxrt = await screen.findByLabelText(/Max runtime \(ms\)/);
    fireEvent.change(maxrt, { target: { value: "9999" } });
    const maxact = await screen.findByLabelText(/Max activations\/hour/);
    fireEvent.change(maxact, { target: { value: "77" } });

    expect(saveSpy).toHaveBeenCalled();
    const lastCall = saveSpy.mock.calls[saveSpy.mock.calls.length - 1];
    const last = lastCall[0][0];
    expect(last.guardrails?.cooldown_ms).toBe(1234);
    expect(last.guardrails?.max_runtime_ms).toBe(9999);
    expect(last.guardrails?.max_activations_per_hour).toBe(77);

    loadSpy.mockRestore();
    saveSpy.mockRestore();
  });
});
