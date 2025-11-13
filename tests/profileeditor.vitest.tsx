import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileEditor } from "../src/components/ProfileEditor";

const sample = {
  id: "p1",
  name: "One",
  regions: [],
  trigger: { type: "IntervalTrigger", interval_ms: 500 },
  condition: { type: "RegionCondition", stable_ms: 1000, downscale: 4 },
  actions: [],
  guardrails: { cooldown_ms: 0 },
};

describe("ProfileEditor", () => {
  it("renders null state", () => {
    render(<ProfileEditor profile={null} onChange={() => {}} />);
    expect(screen.getByText(/No profile selected/)).toBeTruthy();
  });

  it("loads profile JSON and saves edits", () => {
    const onChange = vi.fn();
    render(<ProfileEditor profile={sample as any} onChange={onChange} />);
    const textareas = screen.getAllByRole("textbox");
    const ta = textareas[textareas.length - 1] as HTMLTextAreaElement;
    expect(ta.value).toMatch(/"id": "p1"/);
    const updated = { ...sample, name: "Two" };
    fireEvent.change(ta, { target: { value: JSON.stringify(updated) } });
    fireEvent.click(screen.getByText(/Save Profile/));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].name).toBe("Two");
  });

  it("shows error on invalid JSON and invalid shape", () => {
    const onChange = vi.fn();
    render(<ProfileEditor profile={sample as any} onChange={onChange} />);
    const textareas2 = screen.getAllByRole("textbox");
    const ta = textareas2[textareas2.length - 1] as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "{" } });
  fireEvent.click(screen.getByText(/Save Profile/));
  // Find the error container next to the Save button
  const errorEls = screen.getAllByText(/JSON/);
  expect(errorEls.some((el) => el.tagName.toLowerCase() === "span")).toBe(true);
    fireEvent.change(ta, { target: { value: JSON.stringify({ foo: "bar" }) } });
    fireEvent.click(screen.getByText(/Save Profile/));
    expect(screen.getByText(/Invalid profile shape/)).toBeTruthy();
  });
});
