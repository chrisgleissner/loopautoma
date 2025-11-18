import { useCallback, useEffect, useRef, useState } from "react";
import { actionRecorderClose } from "../tauriBridge";
import { ActionNumberMarker } from "./ActionNumberMarker";

export type RecordedAction =
    | { type: "click"; x: number; y: number; button: "Left" | "Right" | "Middle" }
    | { type: "text"; text: string; x?: number; y?: number };

interface ActionRecorderProps {
    screenshot: string; // base64 PNG data URL
    onComplete: (actions: RecordedAction[]) => void;
    onCancel: () => void;
}

const SCREENSHOT_SCALE = 0.8; // Display screenshot at 80% of original size

export function ActionRecorder({ screenshot, onComplete, onCancel }: ActionRecorderProps) {
    const [recording, setRecording] = useState(false);
    const [actions, setActions] = useState<RecordedAction[]>([]);
    const [textBuffer, setTextBuffer] = useState("");
    const [textStartPos, setTextStartPos] = useState<{ x: number; y: number } | null>(null);

    const screenshotRef = useRef<HTMLDivElement>(null);
    const recordingRef = useRef(false);

    // Sync recording state to ref for event handlers
    useEffect(() => {
        recordingRef.current = recording;
    }, [recording]);

    // Convert screen coordinates (click position on scaled screenshot) to real screen coordinates
    const toRealCoords = useCallback((screenX: number, screenY: number): { x: number; y: number } => {
        if (!screenshotRef.current) return { x: screenX, y: screenY };

        const rect = screenshotRef.current.getBoundingClientRect();
        // Click is relative to the scaled screenshot
        const relX = screenX - rect.left;
        const relY = screenY - rect.top;

        // Convert from displayed size back to original screen coordinates
        return {
            x: Math.round(relX / SCREENSHOT_SCALE),
            y: Math.round(relY / SCREENSHOT_SCALE),
        };
    }, []);

    // Flush accumulated text as a single action
    const flushTextBuffer = useCallback(() => {
        if (textBuffer && textStartPos) {
            const newAction: RecordedAction = {
                type: "text",
                text: textBuffer,
                x: textStartPos.x,
                y: textStartPos.y,
            };
            setActions((prev) => [...prev, newAction]);
            setTextBuffer("");
            setTextStartPos(null);
        }
    }, [textBuffer, textStartPos]);

    // Handle mouse click on screenshot
    const handleScreenshotClick = useCallback((e: React.MouseEvent) => {
        if (!recordingRef.current) return;

        // Flush any pending text first
        flushTextBuffer();

        const realCoords = toRealCoords(e.clientX, e.clientY);
        const newAction: RecordedAction = {
            type: "click",
            x: realCoords.x,
            y: realCoords.y,
            button: e.button === 0 ? "Left" : e.button === 2 ? "Right" : "Middle",
        };

        setActions((prev) => [...prev, newAction]);
    }, [flushTextBuffer, toRealCoords]);

    // Handle keyboard input
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!recordingRef.current) return;

        // Handle special keys
        if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
            return;
        }

        // Ignore modifier keys alone
        if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

        // Handle printable characters
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            setTextBuffer((prev) => prev + e.key);
            // Record starting position for first character
            if (textBuffer === "" && !textStartPos) {
                // Use center of screenshot as default position for text
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                const realCoords = toRealCoords(centerX, centerY);
                setTextStartPos(realCoords);
            }
        } else {
            // Non-printable key or modifier combo - flush buffer and record special key
            flushTextBuffer();
            const specialKey = `[${e.ctrlKey ? "Ctrl+" : ""}${e.altKey ? "Alt+" : ""}${e.shiftKey ? "Shift+" : ""}${e.key}]`;
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const realCoords = toRealCoords(centerX, centerY);
            setActions((prev) => [
                ...prev,
                { type: "text", text: specialKey, x: realCoords.x, y: realCoords.y },
            ]);
        }
    }, [flushTextBuffer, textBuffer, textStartPos, toRealCoords]);

    const handleCancel = useCallback(async () => {
        try {
            await actionRecorderClose();
        } finally {
            onCancel();
        }
    }, [onCancel]);

    const handleToggleRecording = useCallback(() => {
        if (recording) {
            // Stop recording
            flushTextBuffer();
            setRecording(false);
        } else {
            // Start recording
            setActions([]);
            setTextBuffer("");
            setTextStartPos(null);
            setRecording(true);
        }
    }, [recording, flushTextBuffer]);

    const handleComplete = useCallback(async () => {
        flushTextBuffer();
        try {
            await actionRecorderClose();
        } finally {
            onComplete(actions);
        }
    }, [actions, flushTextBuffer, onComplete]);

    const handleRefresh = useCallback(async () => {
        // TODO: Re-minimize window and capture new screenshot
        // For now, just clear actions
        setActions([]);
        setTextBuffer("");
        setTextStartPos(null);
        setRecording(false);
    }, []);

    // Set up keyboard listener
    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // Prevent context menu on screenshot
    useEffect(() => {
        const preventDefault = (e: Event) => e.preventDefault();
        const screenshot = screenshotRef.current;
        if (screenshot) {
            screenshot.addEventListener("contextmenu", preventDefault);
            return () => screenshot.removeEventListener("contextmenu", preventDefault);
        }
    }, []);

    return (
        <div className="action-recorder">
            {/* Header */}
            <div className="action-recorder-header">
                <div className="action-recorder-title">
                    <h2>Action Recorder</h2>
                    <p>Click on the screenshot to record mouse actions, type to record text input</p>
                </div>
                <div className="action-recorder-controls">
                    <button onClick={handleRefresh} title="Capture new screenshot">
                        🔄 Refresh
                    </button>
                    <button
                        onClick={handleToggleRecording}
                        className={recording ? "recording-active" : ""}
                        title={recording ? "Stop recording" : "Start recording"}
                    >
                        {recording ? "⏸ Stop Recording" : "▶ Start Recording"}
                    </button>
                    {recording && (
                        <span className="recording-indicator" title="Recording in progress">
                            🔴 Recording
                        </span>
                    )}
                </div>
            </div>

            {/* Main content area */}
            <div className="action-recorder-content">
                {/* Left: Screenshot with overlays */}
                <div className="action-recorder-screenshot-panel">
                    <div
                        ref={screenshotRef}
                        className="action-recorder-screenshot"
                        style={{
                            backgroundImage: `url(${screenshot})`,
                            width: `${SCREENSHOT_SCALE * 100}vw`,
                            height: `${SCREENSHOT_SCALE * 100}vh`,
                        }}
                        onClick={handleScreenshotClick}
                    >
                        {/* Render action number markers */}
                        {actions.map((action, index) => {
                            // Convert real coordinates back to display coordinates for marker positioning
                            const displayX = (action.x ?? 0) * SCREENSHOT_SCALE;
                            const displayY = (action.y ?? 0) * SCREENSHOT_SCALE;
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
                </div>

                {/* Right: Action legend */}
                <div className="action-recorder-legend">
                    <h3>Recorded Actions ({actions.length})</h3>
                    {actions.length === 0 ? (
                        <p className="action-recorder-legend-empty">
                            {recording
                                ? "Click on the screenshot or type to record actions..."
                                : "Click 'Start Recording' to begin"}
                        </p>
                    ) : (
                        <ul className="action-recorder-legend-list">
                            {actions.map((action, index) => (
                                <li key={index} className="action-recorder-legend-item">
                                    <span className="action-number">{index + 1}</span>
                                    {action.type === "click" ? (
                                        <>
                                            <span className="action-icon">🖱️</span>
                                            <span className="action-details">
                                                {action.button} click at ({action.x}, {action.y})
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="action-icon">⌨️</span>
                                            <span className="action-details">
                                                Type: "{action.text}"
                                            </span>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="action-recorder-legend-actions">
                        <button onClick={handleCancel}>Cancel</button>
                        <button
                            onClick={handleComplete}
                            disabled={actions.length === 0}
                            className="accent"
                        >
                            Done ({actions.length} actions)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
