/**
 * Recording Events Store
 * Captures all input recording events and transformation steps for debugging
 */

export type RecordingLogEntry = {
    id: string;
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'success';
    source: 'tauri' | 'recording-bar' | 'app' | 'transformation';
    message: string;
    data?: any;
};

class RecordingEventsStore {
    private logs: RecordingLogEntry[] = [];
    private listeners: Set<(logs: RecordingLogEntry[]) => void> = new Set();
    private maxLogs = 500;

    log(entry: Omit<RecordingLogEntry, 'id' | 'timestamp'>) {
        const logEntry: RecordingLogEntry = {
            ...entry,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
        };

        this.logs.push(logEntry);

        // Keep only last maxLogs entries
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Notify listeners
        this.notifyListeners();

        // Also log to console with styling
        const style = this.getConsoleStyle(logEntry.level);
        console.log(
            `%c[${logEntry.source}] ${logEntry.message}`,
            style,
            logEntry.data || ''
        );
    }

    private getConsoleStyle(level: RecordingLogEntry['level']): string {
        switch (level) {
            case 'error':
                return 'color: #ff6b6b; font-weight: bold';
            case 'warn':
                return 'color: #ffa94d; font-weight: bold';
            case 'success':
                return 'color: #51cf66; font-weight: bold';
            case 'info':
            default:
                return 'color: #74c0fc';
        }
    }

    getLogs(): RecordingLogEntry[] {
        return [...this.logs];
    }

    clear() {
        this.logs = [];
        this.notifyListeners();
    }

    subscribe(callback: (logs: RecordingLogEntry[]) => void): () => void {
        this.listeners.add(callback);
        // Immediately call with current logs
        callback(this.getLogs());

        return () => {
            this.listeners.delete(callback);
        };
    }

    private notifyListeners() {
        const logs = this.getLogs();
        this.listeners.forEach(listener => listener(logs));
    }

    // Convenience methods for different log levels
    info(source: RecordingLogEntry['source'], message: string, data?: any) {
        this.log({ level: 'info', source, message, data });
    }

    warn(source: RecordingLogEntry['source'], message: string, data?: any) {
        this.log({ level: 'warn', source, message, data });
    }

    error(source: RecordingLogEntry['source'], message: string, data?: any) {
        this.log({ level: 'error', source, message, data });
    }

    success(source: RecordingLogEntry['source'], message: string, data?: any) {
        this.log({ level: 'success', source, message, data });
    }
}

// Singleton instance
export const recordingEventsStore = new RecordingEventsStore();
