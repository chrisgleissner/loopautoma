import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { actionRecorderClose } from "../tauriBridge";
import { ActionNumberMarker } from "./ActionNumberMarker";

const SCREENSHOT_SCALE = 0.8; // Display at 80% of original size

export type RecordedAction =
  | { type: "click"; x: number; y: number; button: "Left" | "Right" | "Middle" }
  | { type: "type"; text: string };

export function ActionRecorderWindow() {
  const recorderWindow = useMemo(() => getCurrentWindow(), []);
  const [recording, setRecording] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [textBuffer, setTextBuffer] = useState("");
  const [textStartPos, setTextStartPos] = useState<{ x: number; y: number } | null>(null);
  const screenshotRef = useRef<HTMLImageElement>(null);

  // Load screenshot from initialization script and auto-start recording
  useEffect(() => {
    const screenshotUrl = (window as any).__ACTION_RECORDER_SCREENSHOT__;
    if (screenshotUrl) {
      setScreenshot(screenshotUrl);
      // Auto-start recording when window opens
      setRecording(true);
    }
  }, []);

  // Handle Escape key to cancel
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        void handleCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Handle keyboard input during recording
  useEffect(() => {
    if (!recording) return;

    const handler = (ev: KeyboardEvent) => {
      // Ignore modifier keys alone
      if (["Shift", "Control", "Alt", "Meta"].includes(ev.key)) {
        return;
      }

      // Check if it's a printable character
      if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        // Printable character - add to buffer
        setTextBuffer((prev) => prev + ev.key);
        
        // If this is the first character, capture current mouse position
        if (textBuffer.length === 0 && textStartPos === null) {
          // Use center of screenshot as default position for typing
          const rect = screenshotRef.current?.getBoundingClientRect();
          if (rect) {
            setTextStartPos({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            });
          }
        }
      } else {
        // Non-printable key - append to buffer with bracket notation (don't flush)
        const keyName = ev.key === " " ? "Space" : ev.key;
        const modifiers = [];
        if (ev.ctrlKey) modifiers.push("Ctrl");
        if (ev.altKey) modifiers.push("Alt");
        if (ev.shiftKey) modifiers.push("Shift");
        if (ev.metaKey) modifiers.push("Meta");

        const keyText = modifiers.length > 0
          ? `[${modifiers.join("+")}+${keyName}]`
          : `[${keyName}]`;

        // Append special key to buffer instead of creating separate action
        setTextBuffer((prev) => prev + keyText);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [recording, textBuffer, textStartPos]);

  const toRealCoords = (screenX: number, screenY: number) => {
    if (!screenshotRef.current) return { x: 0, y: 0 };
    const rect = screenshotRef.current.getBoundingClientRect();
    const relX = screenX - rect.left;
    const relY = screenY - rect.top;
    return {
      x: Math.round(relX / SCREENSHOT_SCALE),
      y: Math.round(relY / SCREENSHOT_SCALE),
    };
  };

  const handleScreenshotClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!recording) return;
    e.preventDefault();

    // Flush text buffer if any
    if (textBuffer.length > 0) {
      setActions((prev) => [...prev, { type: "type", text: textBuffer }]);
      setTextBuffer("");
      setTextStartPos(null);
    }

    // Record click - store real (unscaled) coordinates for playback
    const realCoords = toRealCoords(e.clientX, e.clientY);
    const button = e.button === 0 ? "Left" : e.button === 2 ? "Right" : "Middle";
    setActions((prev) => [...prev, { type: "click", ...realCoords, button }]);
  };

  const handleDeleteAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveAction = (index: number, direction: "up" | "down") => {
    setActions((prev) => {
      if ((direction === "up" && index === 0) || (direction === "down" && index === prev.length - 1)) {
        return prev;
      }
      const newActions = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      [newActions[index], newActions[targetIndex]] = [newActions[targetIndex], newActions[index]];
      return newActions;
    });
  };

  const handleCancel = async () => {
    try {
      await actionRecorderClose();
    } finally {
      await recorderWindow.close();
    }
  };

  const handleDone = async () => {
    try {
      // Flush text buffer if any
      const finalActions = textBuffer.length > 0
        ? [...actions, { type: "type" as const, text: textBuffer }]
        : actions;
      
      console.log("[ActionRecorder] Closing with", finalActions.length, "action(s)");
      
      // Send actions to main window if any exist
      if (finalActions.length > 0) {
        console.log("[ActionRecorder] Emitting actions:", finalActions);
        await recorderWindow.emit("loopautoma://action_recorder_complete", finalActions);
        console.log("[ActionRecorder] Emit successful");
      }
    } catch (err) {
      console.error("[ActionRecorder] Error in handleDone:", err);
    } finally {
      // Always close, even if no actions
      console.log("[ActionRecorder] Closing windows");
      await actionRecorderClose();
      await recorderWindow.close();
    }
  };

  const toggleRecording = () => {
    if (recording) {
      // Stop recording - flush text buffer
      if (textBuffer.length > 0) {
        setActions((prev) => [...prev, { type: "type", text: textBuffer }]);
        setTextBuffer("");
        setTextStartPos(null);
      }
    }
    setRecording(!recording);
  };

  return (
    <div className="action-recorder">
      {/* Header */}
      <div className="action-recorder-header">
        <h2>Action Recorder</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {recording && (
            <div className="recording-indicator" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="recording-dot" />
              <span>Recording</span>
            </div>
          )}
          <button onClick={toggleRecording} className="accent">
            {recording ? "Stop" : "Start"}
          </button>
          <button onClick={handleDone} disabled={actions.length === 0}>
            Done
          </button>
          <button onClick={handleCancel}>Cancel</button>
        </div>
      </div>

      {/* Main content area */}
      <div className="action-recorder-content">
        {/* Screenshot with markers */}
        <div className="action-recorder-screenshot">
          {screenshot && (
            <img
              ref={screenshotRef}
              src={screenshot}
              alt="Screen capture"
              onMouseDown={handleScreenshotClick}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                width: `${SCREENSHOT_SCALE * 100}%`,
                height: `${SCREENSHOT_SCALE * 100}%`,
                cursor: recording ? "crosshair" : "default",
                userSelect: "none",
              }}
            />
          )}
          
          {/* Render action markers at displayed (scaled) positions */}
          {actions.map((action, index) => {
            if (action.type !== "click" || !screenshotRef.current) return null;
            const rect = screenshotRef.current.getBoundingClientRect();
            // action.x and action.y are real (unscaled) coordinates
            // Convert them back to displayed coordinates for marker positioning
            // Must account for both X and Y offsets of the rendered screenshot
            const displayX = rect.left + action.x * SCREENSHOT_SCALE;
            const displayY = rect.top + action.y * SCREENSHOT_SCALE;
            return (
              <ActionNumberMarker
                key={index}
                number={index + 1}
                x={displayX}
                y={displayY}
              />
            );
          })}
        </div>

        {/* Action legend sidebar */}
        <div className="action-recorder-legend">
          <h3>Actions ({actions.length + (textBuffer.length > 0 ? 1 : 0)})</h3>
          <div className="action-list">
            {actions.length === 0 && textBuffer.length === 0 && (
              <p className="muted" style={{ fontSize: 13, padding: 8 }}>
                No actions recorded yet. Click Start to begin.
              </p>
            )}
            {actions.map((action, index) => (
              <div key={index} className="action-item">
                <div className="action-item-controls">
                  <button
                    className="action-item-reorder"
                    onClick={() => handleMoveAction(index, "up")}
                    disabled={index === 0}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    className="action-item-reorder"
                    onClick={() => handleMoveAction(index, "down")}
                    disabled={index === actions.length - 1}
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <span className="action-number">{index + 1}</span>
                <div className="action-item-content">
                  {action.type === "click" ? (
                    <span>Click {action.button} ({action.x},{action.y})</span>
                  ) : (
                    <span><code>{action.text}</code></span>
                  )}
                </div>
                <button
                  className="action-item-delete"
                  onClick={() => handleDeleteAction(index)}
                  title="Delete action"
                >
                  ✕
                </button>
              </div>
            ))}
            {/* Show live text buffer */}
            {textBuffer.length > 0 && (
              <div className="action-item action-item-live">
                <div className="action-item-controls" style={{ visibility: "hidden" }}>
                  <button disabled>▲</button>
                  <button disabled>▼</button>
                </div>
                <span className="action-number">{actions.length + 1}</span>
                <div className="action-item-content">
                  <span><code>{textBuffer}</code></span>
                </div>
                <button className="action-item-delete" disabled style={{ visibility: "hidden" }}>✕</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
