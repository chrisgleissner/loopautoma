import { Event } from "../types";

function fmt(e: Event): string {
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
  }
}

export function EventLog({ events }: { events: Event[] }) {
  return (
    <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid #444", padding: 8 }}>
      {events.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No events yet</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {events.map((e, i) => (
            <li key={i} style={{ fontFamily: "monospace", fontSize: 12 }}>
              {fmt(e)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
