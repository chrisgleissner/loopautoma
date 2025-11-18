/**
 * Recording Logs Panel
 * Shows concise tabular view of recorded input events
 */

import { useEffect, useState } from 'react';
import { recordingEventsStore, RecordingLogEntry } from '../recordingEventsStore';

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${ms}`;
}

function formatEventType(log: RecordingLogEntry): string {
    if (log.source === 'tauri' || log.source === 'recording-bar') {
        if (log.data) {
            const data = log.data as any;
            if (data.kind === 'mouse') return '🖱️ Mouse';
            if (data.kind === 'keyboard') return '⌨️ Keyboard';
        }
    }
    if (log.source === 'transformation') return '🔄 Transform';
    if (log.source === 'app') return '💾 Save';
    return '📋 Event';
}

function formatEventDetails(log: RecordingLogEntry): string {
    if (!log.data) return log.message;

    const data = log.data as any;

    // Mouse events
    if (data.kind === 'mouse' && data.mouse) {
        const mouse = data.mouse;
        const x = Math.round(mouse.x || 0);
        const y = Math.round(mouse.y || 0);

        if (mouse.event_type) {
            const eventType = mouse.event_type;
            if (typeof eventType === 'object') {
                if (eventType.button_down) {
                    return `x=${x}, y=${y}, button=${eventType.button_down}`;
                }
                if (eventType.button_up) {
                    return `x=${x}, y=${y}, button=${eventType.button_up} (release)`;
                }
            }
            if (eventType === 'move') {
                return `x=${x}, y=${y}`;
            }
        }
        return `x=${x}, y=${y}`;
    }

    // Keyboard events
    if (data.kind === 'keyboard' && data.keyboard) {
        const kb = data.keyboard;
        const mods = [];
        if (kb.modifiers?.control) mods.push('Ctrl');
        if (kb.modifiers?.alt) mods.push('Alt');
        if (kb.modifiers?.shift) mods.push('Shift');
        if (kb.modifiers?.meta) mods.push('Meta');

        const keyText = kb.text || kb.key;
        if (mods.length > 0) {
            return `${keyText}[${mods.join('+')}]`;
        }
        return keyText;
    }

    // Transformation events
    if (log.source === 'transformation') {
        return `${data.eventCount || 0} events → ${data.actionCount || 0} actions`;
    }

    return log.message;
}

export function RecordingLogsPanel(props: { onClose: () => void }) {
    const [logs, setLogs] = useState<RecordingLogEntry[]>([]);

    useEffect(() => {
        const unsubscribe = recordingEventsStore.subscribe(setLogs);
        return unsubscribe;
    }, []);

    return (
        <div className="recording-logs-overlay" onClick={props.onClose}>
            <div className="recording-logs-panel" onClick={(e) => e.stopPropagation()}>
                <div className="recording-logs-header">
                    <h3>📋 Recording Event Logs</h3>
                    <div className="recording-logs-actions">
                        <button onClick={() => recordingEventsStore.clear()} disabled={logs.length === 0}>
                            Clear
                        </button>
                        <button onClick={props.onClose}>Close</button>
                    </div>
                </div>

                <div className="recording-logs-content">
                    {logs.length === 0 ? (
                        <p className="recording-logs-empty">No recording events yet. Start recording to see events here.</p>
                    ) : (
                        <table className="recording-logs-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Type</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id}>
                                        <td className="recording-log-time">{formatTime(log.timestamp)}</td>
                                        <td className="recording-log-type">{formatEventType(log)}</td>
                                        <td className="recording-log-details">{formatEventDetails(log)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
