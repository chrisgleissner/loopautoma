import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { startInputRecording, stopInputRecording } from "../tauriBridge";
import { InputEvent, KeyboardInputEvent, MouseInputEvent } from "../types";

export type RecordingEvent =
  | { t: "click"; button: "Left" | "Right" | "Middle"; x: number; y: number }
  | { t: "type"; text: string }
  | { t: "key"; key: string };

export function RecordingBar(props: {
  onStart?: () => void;
  onStop?: (events: RecordingEvent[]) => void;
  onSave?: (events: RecordingEvent[]) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [events, setEvents] = useState<RecordingEvent[]>([]);
  const [timeline, setTimeline] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const typeBuffer = useRef<string>("");
  const recordingRef = useRef(false);
  const eventsRef = useRef<RecordingEvent[]>([]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const flushTypeBuffer = useCallback(() => {
    if (!typeBuffer.current) return;
    const text = typeBuffer.current;
    typeBuffer.current = "";
    setEvents((prev) => [...prev, { t: "type", text }]);
    setTimeline((prev) => [...prev.slice(-19), `type "${text}"`]);
  }, []);

  const pushClick = useCallback((button: "Left" | "Right" | "Middle", x: number, y: number) => {
    setEvents((prev) => [...prev, { t: "click", button, x: Math.round(x), y: Math.round(y) }]);
    setTimeline((prev) => [...prev.slice(-19), `${button} click @ ${Math.round(x)},${Math.round(y)}`]);
  }, []);

  const pushKey = useCallback((key: string) => {
    flushTypeBuffer();
    setEvents((prev) => [...prev, { t: "key", key }]);
    setTimeline((prev) => [...prev.slice(-19), `key ${key}`]);
  }, [flushTypeBuffer]);

  const handleMouseEvent = useCallback((mouse: MouseInputEvent) => {
    const typ = mouse.event_type;
    if (typeof typ === "string") {
      if (typ === "move") {
        return; // too noisy for the timeline
      }
      return;
    }
    if (typ && typeof typ === "object") {
      if ("button_down" in typ && typ.button_down) {
        pushClick(typ.button_down, mouse.x, mouse.y);
      } else if ("button_up" in typ && typ.button_up) {
        setTimeline((prev) => [...prev.slice(-19), `${typ.button_up} release`]);
      }
    }
  }, [pushClick]);

  const handleKeyboardEvent = useCallback((keyboard: KeyboardInputEvent) => {
    const hasModifiers = keyboard.modifiers.alt || keyboard.modifiers.control || keyboard.modifiers.meta;
    const plainChar = keyboard.text && keyboard.text.length === 1 && !hasModifiers;
    if (keyboard.state === "down" && plainChar) {
      typeBuffer.current += keyboard.text ?? "";
      setTimeline((prev) => [...prev.slice(-19), `text "${keyboard.text}"`]);
      return;
    }
    if (keyboard.state === "down") {
      pushKey(keyboard.key);
    }
    if (keyboard.state === "up") {
      flushTypeBuffer();
    }
  }, [flushTypeBuffer, pushKey]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<InputEvent>("loopautoma://input_event", (payload) => {
      if (!recordingRef.current) return;
      const data = payload.payload;
      if (!data) return;
      if (data.kind === "mouse" && data.mouse) {
        handleMouseEvent(data.mouse);
      } else if (data.kind === "keyboard" && data.keyboard) {
        handleKeyboardEvent(data.keyboard);
      } else if (data.kind === "scroll" && data.scroll) {
        setTimeline((prev) => [...prev.slice(-19), `scroll Δ${data.scroll.delta_x},${data.scroll.delta_y}`]);
      }
    }).then((off) => (unlisten = off));
    return () => {
      try { unlisten?.(); } catch {}
    };
  }, [handleKeyboardEvent, handleMouseEvent]);

  const stopRecording = useCallback(async () => {
    recordingRef.current = false;
    try {
      await stopInputRecording();
    } catch (err) {
      console.warn("stop_input_recording failed", err);
    }
    flushTypeBuffer();
    setRecording(false);
    props.onStop?.(eventsRef.current);
  }, [flushTypeBuffer, props]);

  const toggleRecording = useCallback(async () => {
    if (!recording) {
      setError(null);
      setEvents([]);
      setTimeline([]);
      typeBuffer.current = "";
      try {
        await startInputRecording();
        recordingRef.current = true;
        setRecording(true);
        props.onStart?.();
      } catch (err) {
        recordingRef.current = false;
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Unable to start input capture");
      }
    } else {
      await stopRecording();
    }
  }, [props, recording, stopRecording]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
          onClick={toggleRecording}
          title={recording ? "Stop recording" : "Start recording via system-wide hooks"}
      >
        {recording ? "Stop" : "Record"}
      </button>
      {recording && (
        <span className="running-chip" title="Recording in progress">Recording</span>
      )}
      <button
          onClick={() => props.onSave?.(eventsRef.current)}
        disabled={events.length === 0}
        title={events.length ? "Save recorded steps as an ActionSequence" : "Record some interactions to enable saving"}
      >
        Save as ActionSequence
      </button>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{events.length} recorded step(s)</span>
      </div>
      {error && (
        <div role="alert" className="alert" style={{ fontSize: 13 }}>
          {error}
        </div>
      )}
      <div className="timeline-box" aria-live="polite">
        <div className="timeline-header">
          <strong>Live input timeline</strong>
          <button onClick={() => setTimeline([])} disabled={timeline.length === 0}>Clear</button>
        </div>
        {timeline.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>No events yet.</p>
        ) : (
          <ul className="timeline-list">
            {timeline.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Helper to map recording events to ActionSequence actions
export function toActions(events: RecordingEvent[]) {
  type MouseButton = "Left" | "Right" | "Middle";
  const actions: Array<
    | { type: "MoveCursor"; x: number; y: number }
    | { type: "Click"; button: MouseButton }
    | { type: "Type"; text: string }
    | { type: "Key"; key: string }
  > = [];
  for (const ev of events) {
    if (ev.t === "click") {
      actions.push({ type: "MoveCursor", x: ev.x, y: ev.y });
      actions.push({ type: "Click", button: ev.button });
    }
    else if (ev.t === "type") actions.push({ type: "Type", text: ev.text });
    else if (ev.t === "key") actions.push({ type: "Key", key: ev.key });
  }
  return actions;
}
