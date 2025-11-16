import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileEditor } from "../src/components/ProfileEditor";
import { defaultProfilesConfig } from "../src/types";

const sampleConfig = defaultProfilesConfig();

function getTextarea() {
  const textareas = screen.getAllByRole("textbox");
  return textareas[textareas.length - 1] as HTMLTextAreaElement;
}

describe("ProfileEditor", () => {
  it("renders loading state", () => {
    render(<ProfileEditor config={null} onChange={() => {}} />);
    expect(screen.getByText(/Configuration is still loading/)).toBeTruthy();
  });

  it("loads config JSON and saves edits", () => {
    const onChange = vi.fn();
    render(<ProfileEditor config={sampleConfig} onChange={onChange} />);
    const ta = getTextarea();
    expect(ta.value).toMatch(/"profiles"/);
    const next = {
      ...sampleConfig,
      profiles: [
        { ...sampleConfig.profiles[0], name: "Two" },
      ],
    };
    fireEvent.change(ta, { target: { value: JSON.stringify(next) } });
    fireEvent.click(screen.getByText(/Save Config/));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].profiles[0].name).toBe("Two");
  });

  it("shows error on invalid JSON and invalid shape", () => {
    const onChange = vi.fn();
    render(<ProfileEditor config={sampleConfig} onChange={onChange} />);
    const ta = getTextarea();
    fireEvent.change(ta, { target: { value: "{" } });
    fireEvent.click(screen.getByText(/Save Config/));
    // Find the error container next to the Save button
    const errorEls = screen.getAllByText(/JSON/);
    expect(errorEls.some((el) => el.tagName.toLowerCase() === "span")).toBe(true);
    fireEvent.change(ta, { target: { value: JSON.stringify({ foo: "bar" }) } });
    fireEvent.click(screen.getByText(/Save Config/));
    expect(screen.getByText(/Config must be either/)).toBeTruthy();
  });

  it("blocks save when auditProfile reports errors", () => {
    const onChange = vi.fn();
    render(<ProfileEditor config={sampleConfig} onChange={onChange} />);
    const ta = getTextarea();
    const invalid = {
      ...sampleConfig,
      profiles: [
        {
          ...sampleConfig.profiles[0],
          guardrails: { ...sampleConfig.profiles[0].guardrails, cooldown_ms: -50 },
        },
      ],
    };
    fireEvent.change(ta, { target: { value: JSON.stringify(invalid) } });
    fireEvent.click(screen.getByText(/Save Config/));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Cooldown must be ≥ 0 ms/)).toBeTruthy();
  });
});
