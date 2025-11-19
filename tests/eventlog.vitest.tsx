import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventLog } from "../src/components/EventLog";

describe("EventLog", () => {
  it("renders various events", () => {
    render(
      <EventLog
        events={[
          { type: "TriggerFired" },
          { type: "ConditionEvaluated", result: true },
          { type: "ActionStarted", action: "Click" },
          { type: "ActionCompleted", action: "Click", success: true },
          { type: "MonitorStateChanged", state: "Running" },
          { type: "WatchdogTripped", reason: "max_runtime" },
          { type: "Error", message: "oops" },
        ]}
      />
    );
    expect(screen.getByText(/TriggerFired/)).toBeTruthy();
    expect(screen.getByText(/ConditionEvaluated: true/)).toBeTruthy();
    expect(screen.getByText(/ActionStarted: Click/)).toBeTruthy();
    expect(screen.getByText(/ActionCompleted: Click/)).toBeTruthy();
    expect(screen.getByText(/MonitorStateChanged: Running/)).toBeTruthy();
    expect(screen.getByText(/WatchdogTripped: max_runtime/)).toBeTruthy();
    expect(screen.getByText(/Error: oops/)).toBeTruthy();
  });

  it("renders empty state when no events", () => {
    render(<EventLog events={[]} />);
    expect(screen.getByText(/No events yet/)).toBeTruthy();
  });

  it("displays ConditionEvaluated with false result", () => {
    render(
      <EventLog
        events={[{ type: "ConditionEvaluated", result: false }]}
      />
    );

    expect(screen.getByText(/ConditionEvaluated: false/)).toBeTruthy();
  });

  it("displays ActionCompleted with failure", () => {
    render(
      <EventLog
        events={[{ type: "ActionCompleted", action: "Type", success: false }]}
      />
    );

    expect(screen.getByText(/ActionCompleted: Type/)).toBeTruthy();
    expect(screen.getByText(/success=false/)).toBeTruthy();
  });

  it("displays WatchdogTripped with different reasons", () => {
    render(
      <EventLog
        events={[
          { type: "WatchdogTripped", reason: "max_runtime" },
          { type: "WatchdogTripped", reason: "max_activations_per_hour" },
          { type: "WatchdogTripped", reason: "cooldown" },
        ]}
      />
    );

    expect(screen.getByText(/max_runtime/)).toBeTruthy();
    expect(screen.getByText(/max_activations_per_hour/)).toBeTruthy();
    expect(screen.getByText(/cooldown/)).toBeTruthy();
  });

  it("renders events in order provided", () => {
    const { container } = render(
      <EventLog
        events={[
          { type: "TriggerFired" },
          { type: "ConditionEvaluated", result: true },
          { type: "ActionCompleted", action: "Click", success: true },
        ]}
      />
    );

    const items = container.querySelectorAll("li");
    expect(items.length).toBe(3);
  });

  it("handles ActionStarted without action field", () => {
    render(
      <EventLog
        events={[
          { type: "ActionStarted", action: "Click" },
        ]}
      />
    );

    expect(screen.getByText(/ActionStarted: Click/)).toBeTruthy();
  });

  it("handles ConditionEvaluated without result field", () => {
    render(
      <EventLog
        events={[
          { type: "ConditionEvaluated", result: true },
        ]}
      />
    );

    expect(screen.getByText(/ConditionEvaluated: true/)).toBeTruthy();
  });

  it("displays MonitorTick events with timing details", () => {
    render(
      <EventLog
        events={[
          {
            type: "MonitorTick",
            next_check_ms: 5000,
            cooldown_remaining_ms: 2000,
            condition_met: true
          },
        ]}
      />
    );

    // MonitorTick events are filtered out, so should not be displayed
    expect(screen.queryByText(/MonitorTick/)).toBeNull();
  });

  it("filters out MonitorTick events automatically", () => {
    render(
      <EventLog
        events={[
          { type: "TriggerFired" },
          {
            type: "MonitorTick",
            next_check_ms: 5000,
            cooldown_remaining_ms: 0,
            condition_met: false
          },
          { type: "Error", message: "test" },
        ]}
      />
    );

    expect(screen.getByText(/TriggerFired/)).toBeTruthy();
    expect(screen.getByText(/Error: test/)).toBeTruthy();
    expect(screen.queryByText(/MonitorTick/)).toBeNull();
  });

  it("renders many events without crashing", () => {
    const manyEvents = Array.from({ length: 100 }, (_, i) => ({
      type: "TriggerFired" as const,
    }));

    const { container } = render(
      <EventLog events={manyEvents} />
    );

    const items = container.querySelectorAll("li");
    expect(items.length).toBe(100);
  });

  it("uses monospace font for event display", () => {
    const { container } = render(
      <EventLog
        events={[{ type: "TriggerFired" }]}
      />
    );

    const listItem = container.querySelector("li");
    expect(listItem).toBeTruthy();
    expect(listItem?.style.fontFamily).toBe("monospace");
  });
});
