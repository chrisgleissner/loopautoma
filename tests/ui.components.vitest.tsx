import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
        profiles={[{ id: "p1", name: "One", regions: [], trigger: { type: "IntervalTrigger", check_interval_sec: 60 }, condition: { type: "RegionCondition", stable_ms: 1000, downscale: 4 }, actions: [] }]}
        value={"p1"}
        onChange={() => {}}
      />
    );
    const option = screen.getByRole("option", { name: "One" }) as HTMLOptionElement;
    expect(option.selected).toBe(true);
  });

  it("ProfileSelector shows placeholder and emits changes", () => {
    const onChange = vi.fn();
    render(
      <ProfileSelector
        profiles={[
          { id: "p1", name: "Primary", regions: [], trigger: { type: "IntervalTrigger", check_interval_sec: 60 }, condition: { type: "RegionCondition", stable_ms: 1000, downscale: 4 }, actions: [] },
          { id: "p2", name: "Secondary", regions: [], trigger: { type: "IntervalTrigger", check_interval_sec: 30 }, condition: { type: "RegionCondition", stable_ms: 500, downscale: 2 }, actions: [] },
        ]}
        value={null}
        onChange={onChange}
      />
    );
    const select = screen.getByTitle(/Choose the automation profile/i) as HTMLSelectElement;
    expect(select.value).toBe("");
    const placeholder = screen.getByRole("option", { name: /Select profile/i });
    expect((placeholder as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(select, { target: { value: "p2" } });
    expect(onChange).toHaveBeenCalledWith("p2");
  });
});
