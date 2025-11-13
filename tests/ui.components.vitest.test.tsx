import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventLog } from "../src/components/EventLog";
import { ProfileSelector } from "../src/components/ProfileSelector";

describe("UI components", () => {
  it("EventLog renders empty state", () => {
    render(<EventLog events={[]} />);
    expect(screen.getByText(/No events yet/)).toBeTruthy();
  });

  it("ProfileSelector lists options", () => {
    render(
      <ProfileSelector
        profiles={[{ id: "p1", name: "One", regions: [], trigger: { type: "IntervalTrigger", interval_ms: 500 }, condition: { type: "RegionCondition", stable_ms: 1000, downscale: 4 }, actions: [] }]}
        value={"p1"}
        onChange={() => {}}
      />
    );
    const option = screen.getByRole("option", { name: "One" }) as HTMLOptionElement;
    expect(option.selected).toBe(true);
  });
});
