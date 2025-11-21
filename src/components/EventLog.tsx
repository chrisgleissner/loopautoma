import { useState, useRef, useEffect } from "react";
import { Event } from "../types";

interface EventRow {
  time: string;
  name: string;
  details: string;
  fullDetails?: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: string;
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
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, content: "" });
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  const handleRowHover = (e: React.MouseEvent, event: Event) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      visible: true,
      x: e.clientX + 10,
      y: e.clientY + 10,
      content: JSON.stringify(event, null, 2)
    });
  };

  const handleRowLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  // Hide tooltip when scrolling
  useEffect(() => {
    const container = document.querySelector('.event-log');
    if (!container) return;

    const hideOnScroll = () => {
      setTooltip(prev => ({ ...prev, visible: false }));
    };

    container.addEventListener('scroll', hideOnScroll);
    return () => container.removeEventListener('scroll', hideOnScroll);
  }, []);

  return (
    <>
      <div className="event-log" style={{ maxHeight: 280, overflowX: "auto", overflowY: "auto", border: "1px solid #444", fontSize: 9, fontFamily: "monospace", position: "relative" }}>
        {filteredEvents.length === 0 ? (
          <div style={{ opacity: 0.7, padding: 8 }}>No events yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: "600px" }}>
            <thead style={{ position: "sticky", top: 0, backgroundColor: "#2d2d2d", borderBottom: "1px solid #555" }}>
              <tr>
                <th style={{ width: "15%", padding: "3px 4px", textAlign: "left", fontWeight: "bold" }}>Time</th>
                <th style={{ width: "25%", padding: "3px 4px", textAlign: "left", fontWeight: "bold" }}>Name</th>
                <th style={{ width: "55%", padding: "3px 4px", textAlign: "left", fontWeight: "bold" }}>Details</th>
                <th style={{ width: "5%", padding: "3px 4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((e, i) => {
                const row = formatEvent(e, i);
                const isExpanded = expandedRows.has(i);
                const hasMore = row.fullDetails && row.fullDetails !== row.details;

                return (
                  <tr 
                    key={i} 
                    style={{ borderBottom: "1px solid #3a3a3a", cursor: "help" }}
                    onMouseEnter={(event) => handleRowHover(event, e)}
                    onMouseMove={(event) => handleRowHover(event, e)}
                    onMouseLeave={handleRowLeave}
                  >
                    <td style={{ padding: "3px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.time}</td>
                    <td style={{ padding: "3px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</td>
                    <td style={{ padding: "3px 4px", whiteSpace: isExpanded ? "pre-wrap" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", wordBreak: isExpanded ? "break-word" : "normal" }}>
                      {isExpanded && hasMore ? row.fullDetails : row.details}
                    </td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>
                      {hasMore && (
                          <button
                          onClick={() => toggleExpand(i)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "inherit",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: 9,
                            opacity: 0.7
                          }}
                            title={isExpanded ? "Collapse details" : "Expand details"}
                            aria-label={isExpanded ? "Collapse details" : "Expand details"}
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
      
      {/* Hover tooltip */}
      {tooltip.visible && (
        <div
          ref={tooltipRef}
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y,
            backgroundColor: "#1a1a1a",
            border: "1px solid #555",
            borderRadius: "4px",
            padding: "8px",
            fontSize: "10px",
            fontFamily: "monospace",
            maxWidth: "500px",
            maxHeight: "300px",
            overflow: "auto",
            zIndex: 10000,
            pointerEvents: "none",
            whiteSpace: "pre",
            boxShadow: "0 4px 8px rgba(0,0,0,0.3)"
          }}
        >
          {tooltip.content}
        </div>
      )}
    </>
  );
}
