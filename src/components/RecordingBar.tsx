import { useCallback, useEffect, useRef, useState } from "react";
import { startInputRecording, stopInputRecording, checkInputPrerequisites } from "../tauriBridge";
import { InputEvent, KeyboardInputEvent, MouseInputEvent } from "../types";
import { subscribeEvent } from "../eventBridge";
import { PrerequisiteCheck } from "./PrerequisiteCheck";
import { recordingEventsStore } from "../recordingEventsStore";
import { RecordingLogsPanel } from "./RecordingLogsPanel";

export type RecordingEvent =
  | { t: "click"; button: "Left" | "Right" | "Middle"; x: number; y: number }
  | { t: "type"; text: string }
  | { t: "key"; key: string };

export function RecordingBar(props: {
  onStart?: () => void;
  onStop?: (events: RecordingEvent[]) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [events, setEvents] = useState<RecordingEvent[]>([]);
  const [timeline, setTimeline] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPrereqCheck, setShowPrereqCheck] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
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
    const newEvent = { t: "type" as const, text };
    setEvents((prev) => {
      const next = [...prev, newEvent];
      eventsRef.current = next;
      return next;
    });
    setTimeline((prev) => [...prev.slice(-19), `type "${text}"`]);
  }, []);

  const pushClick = useCallback((button: "Left" | "Right" | "Middle", x: number, y: number) => {
    const newEvent = { t: "click" as const, button, x: Math.round(x), y: Math.round(y) };
    console.log("[RecordingBar] pushClick:", newEvent);
    recordingEventsStore.success('recording-bar', `Click event captured: ${button} at (${Math.round(x)}, ${Math.round(y)})`, newEvent);
    setEvents((prev) => {
      const next = [...prev, newEvent];
      eventsRef.current = next;
      recordingEventsStore.info('recording-bar', `Events buffer now contains ${next.length} event(s)`);
      return next;
    });
    setTimeline((prev) => [...prev.slice(-19), `${button} click @ ${Math.round(x)},${Math.round(y)}`]);
  }, []);

  const pushKey = useCallback((key: string) => {
    flushTypeBuffer();
    const newEvent = { t: "key" as const, key };
    setEvents((prev) => {
      const next = [...prev, newEvent];
      eventsRef.current = next;
      return next;
    });
    setTimeline((prev) => [...prev.slice(-19), `key ${key}`]);
  }, [flushTypeBuffer]);

  const handleMouseEvent = useCallback((mouse: MouseInputEvent) => {
    const typ = mouse.event_type;
    recordingEventsStore.info('recording-bar', `handleMouseEvent called, event_type: ${JSON.stringify(typ)}`, { mouse });

    if (typeof typ === "string") {
      if (typ === "move") {
        return; // too noisy for the timeline
      }
      return;
    }
    if (typ && typeof typ === "object") {
      if ("button_down" in typ && typ.button_down) {
        recordingEventsStore.info('recording-bar', `Calling pushClick for button_down: ${typ.button_down}`);
        pushClick(typ.button_down, mouse.x, mouse.y);
      } else if ("button_up" in typ && typ.button_up) {
        recordingEventsStore.info('recording-bar', `Button up detected: ${typ.button_up}`);
        setTimeline((prev) => [...prev.slice(-19), `${typ.button_up} release`]);
      }
    }
  }, [pushClick]);

  const handleKeyboardEvent = useCallback((keyboard: KeyboardInputEvent) => {
    recordingEventsStore.info('recording-bar', `handleKeyboardEvent called, key: ${keyboard.key}, state: ${keyboard.state}, text: ${keyboard.text}`, { keyboard });

    const hasModifiers = keyboard.modifiers.alt || keyboard.modifiers.control || keyboard.modifiers.meta;
    const plainChar = keyboard.text && keyboard.text.length === 1 && !hasModifiers;

    if (keyboard.state === "down" && plainChar) {
      recordingEventsStore.info('recording-bar', `Adding to type buffer: "${keyboard.text}"`);
      typeBuffer.current += keyboard.text ?? "";
      setTimeline((prev) => [...prev.slice(-19), `text "${keyboard.text}"`]);
      return;
    }
    if (keyboard.state === "down") {
      recordingEventsStore.info('recording-bar', `Calling pushKey for: ${keyboard.key}`);
      pushKey(keyboard.key);
    }
    if (keyboard.state === "up") {
      recordingEventsStore.info('recording-bar', `Key up - flushing type buffer`);
      flushTypeBuffer();
    }
  }, [flushTypeBuffer, pushKey]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    subscribeEvent<InputEvent>("loopautoma://input_event", (data) => {
      console.log("[RecordingBar] Received input event:", data, "recording:", recordingRef.current);

      if (!data) return;

      // Log ALL events to the UI table (even when not recording, for debugging)
      if (data.kind === "mouse" && data.mouse) {
        const eventType = data.mouse.event_type;
        const isMove = typeof eventType === "string" && eventType === "move";
        if (!isMove) {
          recordingEventsStore.info('recording-bar', `Mouse event (recording: ${recordingRef.current})`, data);
        }
      } else if (data.kind === "keyboard" && data.keyboard) {
        recordingEventsStore.info('recording-bar', `Keyboard event (recording: ${recordingRef.current})`, data);
      } else if (data.kind === "scroll" && data.scroll) {
        recordingEventsStore.info('recording-bar', `Scroll event (recording: ${recordingRef.current})`, data);
      }

      // Only process events for recording when actually recording
      if (!recordingRef.current) return;

      if (data.kind === "mouse" && data.mouse) {
        handleMouseEvent(data.mouse);
      } else if (data.kind === "keyboard" && data.keyboard) {
        handleKeyboardEvent(data.keyboard);
      } else if (data.kind === "scroll" && data.scroll) {
        setTimeline((prev) => [...prev.slice(-19), `scroll Δ${data.scroll.delta_x},${data.scroll.delta_y}`]);
      }
    }).then((off) => (dispose = off));
    return () => {
      try { dispose?.(); } catch { }
    };
  }, [handleKeyboardEvent, handleMouseEvent]);

  const stopRecording = useCallback(async () => {
    recordingRef.current = false;
    recordingEventsStore.info('recording-bar', 'Stopping recording...');
    try {
      await stopInputRecording();
      recordingEventsStore.success('recording-bar', 'Backend recording stopped successfully');
    } catch (err) {
      console.warn("stop_input_recording failed", err);
      recordingEventsStore.error('recording-bar', 'Failed to stop backend recording', err);
    }
    flushTypeBuffer();
    setRecording(false);
    console.log("[RecordingBar] Stopping recording with", eventsRef.current.length, "events:", eventsRef.current);
    recordingEventsStore.info('recording-bar', `Calling onStop with ${eventsRef.current.length} event(s)`, eventsRef.current);
    props.onStop?.(eventsRef.current);
  }, [flushTypeBuffer, props]);

  const toggleRecording = useCallback(async () => {
    if (!recording) {
      setError(null);
      setEvents([]);
      eventsRef.current = [];
      setTimeline([]);
      typeBuffer.current = "";

      // Check prerequisites before attempting to start (only in desktop mode)
      try {
        const prereqs = await checkInputPrerequisites();
        const allGood = prereqs.x11_session && prereqs.x11_connection &&
          prereqs.xinput_available && prereqs.xtest_available &&
          prereqs.backend_not_fake && prereqs.feature_enabled;

        // In desktop mode, show detailed modal if prerequisites fail
        // In web mode, let it fail naturally with error message
        if (!allGood && prereqs.session_type !== "web") {
          setShowPrereqCheck(true);
          return;
        }
      } catch (prereqErr) {
        console.warn("Prerequisite check failed, will try to start anyway:", prereqErr);
      }

      try {
        recordingEventsStore.info('recording-bar', 'Calling startInputRecording()...');
        await startInputRecording();
        recordingEventsStore.success('recording-bar', 'startInputRecording() succeeded!');
        recordingRef.current = true;
        setRecording(true);
        props.onStart?.();
      } catch (err) {
        recordingRef.current = false;
        const message = err instanceof Error ? err.message : String(err);
        recordingEventsStore.error('recording-bar', `startInputRecording() failed: ${message}`, err);
        setError(message || "Unable to start input capture");
        // Only show detailed modal in desktop mode, not web mode
        const isWebMode = message.includes("web preview") || message.includes("Tauri");
        if (!isWebMode) {
          setShowPrereqCheck(true);
        }
      }
    } else {
      await stopRecording();
    }
  }, [props, recording, stopRecording]);

  return (
    <>
      {showPrereqCheck && (
        <PrerequisiteCheck onClose={() => setShowPrereqCheck(false)} />
      )}
      {showLogs && (
        <RecordingLogsPanel onClose={() => setShowLogs(false)} />
      )}
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
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {events.length} recorded step(s)
            {events.length > 0 && !recording && " (will be added to profile)"}
          </span>
          <button
            onClick={() => setShowLogs(true)}
            title="View detailed recording event logs for debugging"
            style={{ fontSize: 12, padding: '4px 8px' }}
          >
            📋 View Logs
          </button>
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
    </>
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
    else if (ev.t === "key") {
      // Convert special keys into Type action with inline key syntax
      actions.push({ type: "Type", text: `{Key:${ev.key}}` });
    }
  }
  return actions;
}
