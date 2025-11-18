import { useCallback, useState } from "react";
import { actionRecorderShow } from "../tauriBridge";

export type RecordingEvent =
  | { t: "click"; button: "Left" | "Right" | "Middle"; x: number; y: number }
  | { t: "type"; text: string };

export function RecordingBar() {
  const [error, setError] = useState<string | null>(null);

  const openActionRecorder = useCallback(async () => {
    try {
      setError(null);
      await actionRecorderShow();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Unable to open Action Recorder");
    }
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={openActionRecorder}
          title="Open Action Recorder to capture mouse clicks and keyboard input on a screenshot"
          className="accent"
        >
          📹 Record Actions
        </button>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Click to open full-screen Action Recorder
        </span>
      </div>
      {error && (
        <div role="alert" className="alert" style={{ fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// Helper to map recording events to ActionSequence actions
export function toActions(events: RecordingEvent[]) {
  type MouseButton = "Left" | "Right" | "Middle";
  const actions: Array<
    | { type: "Click"; x: number; y: number; button: MouseButton }
    | { type: "Type"; text: string }
  > = [];
  for (const ev of events) {
    if (ev.t === "click") {
      actions.push({ type: "Click", x: ev.x, y: ev.y, button: ev.button });
    }
    else if (ev.t === "type") actions.push({ type: "Type", text: ev.text });
  }
  return actions;
}
