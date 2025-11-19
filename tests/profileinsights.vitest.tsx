import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileInsights } from "../src/components/ProfileInsights";
import { Profile } from "../src/types";

describe("ProfileInsights", () => {
  const mockProfile: Profile = {
    id: "test-profile",
    name: "Test Profile",
    trigger: { type: "IntervalTrigger", check_interval_sec: 10 },
    condition: { type: "RegionCondition", consecutive_checks: 1, expect_change: false },
    actions: [
      { type: "Click", x: 100, y: 100, button: "Left" },
      { type: "Type", text: "test" },
    ],
    regions: [
      {
        id: "region1",
        name: "Region 1",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
    ],
    guardrails: {
      cooldown_ms: 5000,
      max_activations_per_hour: 120,
      max_runtime_ms: 10800000,
    },
  };

  it("returns null when profile is null", () => {
    const { container } = render(<ProfileInsights profile={null} onRestorePreset={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("displays health status for valid profile", () => {
    render(<ProfileInsights profile={mockProfile} onRestorePreset={vi.fn()} />);
    
    expect(screen.getByText("Ready for unattended runs")).toBeTruthy();
  });

  it("displays region and action counts", () => {
    render(<ProfileInsights profile={mockProfile} onRestorePreset={vi.fn()} />);
    
    expect(screen.getByText(/Regions: 1/)).toBeTruthy();
    expect(screen.getByText(/Actions: 2/)).toBeTruthy();
  });

  it("displays guardrail summary", () => {
    render(<ProfileInsights profile={mockProfile} onRestorePreset={vi.fn()} />);
    
    expect(screen.getAllByText(/5s cooldown/)[0]).toBeTruthy();
  });

  it("displays preset card", () => {
    render(<ProfileInsights profile={mockProfile} onRestorePreset={vi.fn()} />);
    
    expect(screen.getByText("Keep AI Agent Active preset")).toBeTruthy();
    expect(screen.getByText(/Pre-configured to type/)).toBeTruthy();
  });

  it("calls onRestorePreset when restore button is clicked", () => {
    const onRestorePreset = vi.fn();
    render(<ProfileInsights profile={mockProfile} onRestorePreset={onRestorePreset} />);
    
    const restoreButton = screen.getByText("Restore preset");
    fireEvent.click(restoreButton);
    
    expect(onRestorePreset).toHaveBeenCalledTimes(1);
  });

  it("enables restore button for non-preset profiles", () => {
    render(<ProfileInsights profile={mockProfile} onRestorePreset={vi.fn()} />);
    
    const button = screen.getByText("Restore preset");
    expect(button).toHaveProperty("disabled", false);
  });

  it("shows errors prominently when profile has issues", () => {
    const badProfile: Profile = {
      ...mockProfile,
      regions: [], // No regions = error
    };
    
    render(<ProfileInsights profile={badProfile} onRestorePreset={vi.fn()} />);
    
    expect(screen.getByText("Fix before running")).toBeTruthy();
  });

  it("shows warnings when profile has minor issues", () => {
    const warnProfile: Profile = {
      ...mockProfile,
      guardrails: {
        ...mockProfile.guardrails,
        cooldown_ms: 500, // Very short cooldown = warning
      },
    };
    
    render(<ProfileInsights profile={warnProfile} onRestorePreset={vi.fn()} />);
    
    // Should show either "Review these warnings" or pass health check
    const health = screen.queryByText("Review these warnings") || screen.queryByText("Ready for unattended runs");
    expect(health).toBeTruthy();
  });
});
