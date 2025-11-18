import { Event } from "../types";

function fmt(e: Event): string {
  const eventType = e.type;
  switch (e.type) {
    case "TriggerFired":
      return "TriggerFired";
    case "ConditionEvaluated":
      return `ConditionEvaluated: ${e.result}`;
    case "ActionStarted":
      return `ActionStarted: ${e.action}`;
    case "ActionCompleted":
      return `ActionCompleted: ${e.action} (success=${e.success})`;
    case "MonitorStateChanged":
      return `MonitorStateChanged: ${e.state}`;
    case "WatchdogTripped":
      return `WatchdogTripped: ${e.reason}`;
    case "Error":
      return `Error: ${e.message}`;
    case "MonitorTick": {
      const next = (e.next_check_ms / 1000).toFixed(1);
      const cooldown = (e.cooldown_remaining_ms / 1000).toFixed(1);
      const condition = e.condition_met ? "true" : "false";
      return `MonitorTick: next=${next}s cooldown=${cooldown}s condition_met=${condition}`;
    }
    default:
      return `Event(${eventType})`;
  }
}

export function EventLog({ events }: { events: Event[] }) {
  // Filter out MonitorTick events - they're too noisy and only useful for CountdownTimer
  const filteredEvents = events.filter(e => e.type !== "MonitorTick");

  return (
    <div className="event-log" style={{ maxHeight: 240, overflow: "auto", border: "1px solid #444", padding: 8 }}>
      {filteredEvents.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No events yet</div>
      ) : (
        <ul className="event-log-list" style={{ margin: 0, paddingLeft: 16 }}>
          {filteredEvents.map((e, i) => (
            <li key={i} style={{ fontFamily: "monospace", fontSize: 12 }}>
              {fmt(e)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
