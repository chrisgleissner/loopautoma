import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { EventLog } from "../src/components/EventLog";
import { Event } from "../src/types";

const baseEvents: Event[] = [
  { type: "TriggerFired" },
  { type: "ConditionEvaluated", result: true },
  { type: "ActionStarted", action: "Click primary button" },
  { type: "ActionCompleted", action: "Click primary button", success: true },
  { type: "MonitorStateChanged", state: "Running" },
  { type: "WatchdogTripped", reason: "max_runtime" },
  { type: "Error", message: "oops" },
];

describe("EventLog", () => {
  it("renders events inside a table with the new Name/Details columns", () => {
    render(<EventLog events={baseEvents} />);

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1); // header + data rows

    expect(screen.getByText("Trigger Fired")).toBeInTheDocument();
    expect(screen.getByText("Condition Evaluated")).toBeInTheDocument();
    expect(screen.getByText(/Result: true/)).toBeInTheDocument();
    expect(screen.getByText("Action Completed")).toBeInTheDocument();
    expect(screen.getByText("Monitor State")).toBeInTheDocument();
    expect(screen.getByText(/⚠️ Watchdog/)).toBeInTheDocument();
    expect(screen.getByText(/❌ Error/)).toBeInTheDocument();
    expect(screen.getByText(/oops/)).toBeInTheDocument();
  });

  it("shows the empty state message when no events are provided", () => {
    render(<EventLog events={[]} />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("filters MonitorTick events out of the visible list", () => {
    const events: Event[] = [
      { type: "TriggerFired" },
      {
        type: "MonitorTick",
        next_check_ms: 5000,
        cooldown_remaining_ms: 2000,
        condition_met: true,
      },
      { type: "Error", message: "tick should be hidden" },
    ];

    render(<EventLog events={events} />);
    expect(screen.getByText("Trigger Fired")).toBeInTheDocument();
    expect(screen.getByText(/tick should be hidden/)).toBeInTheDocument();
    expect(screen.queryByText(/MonitorTick/)).not.toBeInTheDocument();
  });

  it("expands long details when the disclosure button is clicked", () => {
    const longAction = "Type A REALLY LONG STRING THAT SHOULD BE TRUNCATED IN THE TABLE CELL";
    const events: Event[] = [
      { type: "ActionCompleted", action: longAction, success: false },
    ];

    render(<EventLog events={events} />);

    const detailsCell = screen.getByText(/Type A REALLY LONG STRING/);
    expect(detailsCell.textContent).toContain("...");

    const toggle = screen.getByRole("button", { name: /expand details/i });
    fireEvent.click(toggle);

    const expanded = screen.getByText(`✗ ${longAction}`);
    expect(expanded).toBeInTheDocument();
  });

  it("shows and hides the JSON tooltip on hover", () => {
    render(<EventLog events={baseEvents} />);
    const anyRow = screen.getAllByRole("row")[1];

    fireEvent.mouseEnter(anyRow, { clientX: 50, clientY: 40 });
    expect(screen.getByText(/"type": "TriggerFired"/)).toBeInTheDocument();

    fireEvent.mouseLeave(anyRow);
    expect(screen.queryByText(/"type": "TriggerFired"/)).not.toBeInTheDocument();
  });

  it("falls back to JSON stringification for unknown event types", () => {
    const unknownEvent = { type: "TotallyNewEvent", payload: { foo: "bar" } } as unknown as Event;
    render(<EventLog events={[unknownEvent]} />);

    expect(screen.getAllByText(/TotallyNewEvent/)[0]).toBeInTheDocument();
    expect(screen.getByText(/"foo":"bar"/)).toBeInTheDocument();
  });

  it("renders multiple Watchdog reasons distinctly", () => {
    render(
      <EventLog
        events={[
          { type: "WatchdogTripped", reason: "max_runtime" },
          { type: "WatchdogTripped", reason: "heartbeat_stalled" },
        ]}
      />
    );

    expect(screen.getByText(/max_runtime/)).toBeInTheDocument();
    expect(screen.getByText(/heartbeat_stalled/)).toBeInTheDocument();
  });

  it("keeps rows in the same order as supplied events", () => {
    const events: Event[] = [
      { type: "TriggerFired" },
      { type: "ConditionEvaluated", result: false },
      { type: "ActionStarted", action: "Type" },
    ];

    render(<EventLog events={events} />);
    const rows = screen.getAllByRole("row").slice(1); // ignore header

    expect(rows[0]).toHaveTextContent("Trigger Fired");
    expect(rows[1]).toHaveTextContent("Condition Evaluated");
    expect(rows[2]).toHaveTextContent("Action Started");
  });
});
