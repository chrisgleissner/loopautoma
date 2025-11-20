import { useState } from "react";
import { Event } from "../types";

interface EventRow {
  time: string;
  name: string;
  details: string;
  fullDetails?: string;
}

function formatEvent(e: Event, index: number): EventRow {
  const time = new Date().toLocaleTimeString();

  switch (e.type) {
    case "TriggerFired":
      return { time, name: "Trigger Fired", details: "Condition check initiated" };
    case "ConditionEvaluated":
      return { time, name: "Condition Evaluated", details: `Result: ${e.result}` };
    case "ActionStarted":
      return { time, name: "Action Started", details: e.action.length > 50 ? `${e.action.substring(0, 50)}...` : e.action, fullDetails: e.action };
    case "ActionCompleted":
      const status = e.success ? "✓" : "✗";
      return { time, name: "Action Completed", details: `${status} ${e.action.length > 40 ? `${e.action.substring(0, 40)}...` : e.action}`, fullDetails: `${status} ${e.action}` };
    case "MonitorStateChanged":
      return { time, name: "Monitor State", details: e.state };
    case "WatchdogTripped":
      return { time, name: "⚠️ Watchdog", details: e.reason };
    case "Error":
      return { time, name: "❌ Error", details: e.message.length > 60 ? `${e.message.substring(0, 60)}...` : e.message, fullDetails: e.message };
    case "MonitorTick": {
      const next = (e.next_check_ms / 1000).toFixed(1);
      const cooldown = (e.cooldown_remaining_ms / 1000).toFixed(1);
      const condition = e.condition_met ? "✓" : "✗";
      return { time, name: "Tick", details: `next=${next}s cooldown=${cooldown}s condition=${condition}` };
    }
    default:
      return { time, name: e.type, details: JSON.stringify(e) };
  }
}

export function EventLog({ events }: { events: Event[] }) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Filter out MonitorTick events - they're too noisy and only useful for CountdownTimer
  const filteredEvents = events.filter(e => e.type !== "MonitorTick");

  const toggleExpand = (index: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="event-log" style={{ maxHeight: 280, overflow: "auto", border: "1px solid #444", fontSize: 11, fontFamily: "monospace" }}>
      {filteredEvents.length === 0 ? (
        <div style={{ opacity: 0.7, padding: 8 }}>No events yet</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead style={{ position: "sticky", top: 0, backgroundColor: "#2d2d2d", borderBottom: "1px solid #555" }}>
            <tr>
              <th style={{ width: "15%", padding: "4px 6px", textAlign: "left", fontWeight: "bold" }}>Time</th>
              <th style={{ width: "25%", padding: "4px 6px", textAlign: "left", fontWeight: "bold" }}>Name</th>
              <th style={{ width: "55%", padding: "4px 6px", textAlign: "left", fontWeight: "bold" }}>Details</th>
              <th style={{ width: "5%", padding: "4px 6px" }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map((e, i) => {
              const row = formatEvent(e, i);
              const isExpanded = expandedRows.has(i);
              const hasMore = row.fullDetails && row.fullDetails !== row.details;

              return (
                <tr key={i} style={{ borderBottom: "1px solid #3a3a3a" }}>
                  <td style={{ padding: "4px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.time}</td>
                  <td style={{ padding: "4px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</td>
                  <td style={{ padding: "4px 6px", whiteSpace: isExpanded ? "pre-wrap" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", wordBreak: isExpanded ? "break-word" : "normal" }}>
                    {isExpanded && hasMore ? row.fullDetails : row.details}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "center" }}>
                    {hasMore && (
                      <button
                        onClick={() => toggleExpand(i)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "inherit",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 11,
                          opacity: 0.7
                        }}
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? "▲" : "▼"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
