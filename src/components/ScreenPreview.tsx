import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { startScreenStream, stopScreenStream } from "../tauriBridge";
import { Rect, Region, ScreenFrame } from "../types";
import { dragToScreenRect, DragSelection } from "../utils/region";

export type RegionDraft = { rect: Rect; id?: string; name?: string };

type ScreenPreviewProps = {
  regions?: Region[];
  disabled?: boolean;
  onRegionAdd?: (region: RegionDraft) => Promise<void> | void;
};

export function ScreenPreview({ regions, disabled, onRegionAdd }: ScreenPreviewProps) {
  const [streaming, setStreaming] = useState(false);
  const [frame, setFrame] = useState<ScreenFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragSelection | null>(null);
  const [pendingRect, setPendingRect] = useState<Rect | null>(null);
  const [regionName, setRegionName] = useState("");
  const [regionId, setRegionId] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamingRef = useRef(false);
  const regionCount = regions?.length ?? 0;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ScreenFrame>("loopautoma://screen_frame", (payload) => {
      if (!streamingRef.current) return;
      const next = payload.payload;
      if (!next) return;
      setFrame(next);
    }).then((off) => (unlisten = off));
    return () => {
      try { unlisten?.(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!frame || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
    }
    const expected = frame.width * frame.height * 4;
    if (frame.bytes.length < expected) {
      console.warn("screen_frame bytes shorter than expected", { expected, actual: frame.bytes.length });
      return;
    }
    const bytes = new Uint8ClampedArray(frame.bytes.slice(0, expected));
    const imageData = new ImageData(bytes, frame.width, frame.height);
    ctx.putImageData(imageData, 0, 0);
  }, [frame]);

  const startStream = useCallback(async () => {
    if (streamingRef.current) return;
    setError(null);
    try {
      await startScreenStream(3);
      streamingRef.current = true;
      setStreaming(true);
    } catch (err) {
      streamingRef.current = false;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Unable to start screen preview");
    }
  }, []);

  const stopStream = useCallback(async () => {
    if (!streamingRef.current) return;
    try {
      await stopScreenStream();
    } catch (err) {
      console.warn("stop_screen_stream failed", err);
    } finally {
      streamingRef.current = false;
      setStreaming(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (streamingRef.current) {
        stopStream();
      }
    };
  }, [stopStream]);

  useEffect(() => {
    if (disabled && streamingRef.current) {
      stopStream();
    }
  }, [disabled, stopStream]);

  const resetPending = useCallback(() => {
    setPendingRect(null);
    setRegionId("");
    setRegionName("");
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!frame || disabled) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = clamp(event.clientX - bounds.left, 0, bounds.width);
      const y = clamp(event.clientY - bounds.top, 0, bounds.height);
      setDrag({ start: { x, y }, current: { x, y } });
      resetPending();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [disabled, frame, resetPending],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    setDrag((current) => {
      if (!current) return current;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = clamp(event.clientX - bounds.left, 0, bounds.width);
      const y = clamp(event.clientY - bounds.top, 0, bounds.height);
      return { start: current.start, current: { x, y } };
    });
  }, []);

  const finalizeDrag = useCallback(() => {
    if (!drag || !frame || !canvasRef.current) {
      setDrag(null);
      return;
    }
    const bounds = canvasRef.current.getBoundingClientRect();
    const rect = dragToScreenRect(drag, frame, { width: bounds.width, height: bounds.height });
    setDrag(null);
    if (rect) {
      setPendingRect(rect);
      setRegionName((prev) => prev || `Region ${regionCount + 1}`);
      setRegionId(`region-${Date.now().toString(36)}`);
    }
  }, [drag, frame, regionCount]);

  const handlePointerTerminal = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
      finalizeDrag();
    },
    [finalizeDrag],
  );

  const selectionBox = drag
    ? {
        left: `${Math.min(drag.start.x, drag.current.x)}px`,
        top: `${Math.min(drag.start.y, drag.current.y)}px`,
        width: `${Math.abs(drag.current.x - drag.start.x)}px`,
        height: `${Math.abs(drag.current.y - drag.start.y)}px`,
      }
    : null;

  const handleAddRegion = useCallback(async () => {
    if (!pendingRect || !onRegionAdd) return;
    const payload = {
      rect: pendingRect,
      id: regionId.trim() || `region-${Date.now().toString(36)}`,
      name: regionName.trim() || undefined,
    };
    try {
      await onRegionAdd(payload);
      resetPending();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to add region to profile");
    }
  }, [onRegionAdd, pendingRect, regionId, regionName, resetPending]);

  const meta = frame
    ? `${frame.display.name ?? `Display ${frame.display.id}`} · ${frame.display.width}×${frame.display.height} px · scale ${frame.display.scale_factor.toFixed(2)}`
    : "";

  return (
    <div className="screen-preview-panel">
      <div className="screen-preview-toolbar">
        <button onClick={streaming ? stopStream : startStream} disabled={disabled}>
          {streaming ? "Stop preview" : "Start preview"}
        </button>
        {frame && (
          <span className="screen-preview-meta" title="Display info">
            {meta}
          </span>
        )}
      </div>
      {disabled && (
        <p className="muted">Select a profile to enable region authoring.</p>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="screen-preview-stage">
        <canvas
          ref={canvasRef}
          className="screen-preview-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerTerminal}
          onPointerLeave={handlePointerTerminal}
          onPointerCancel={handlePointerTerminal}
        />
        {selectionBox && <div className="selection-overlay" style={selectionBox} />}
        {!frame && (
          <div className="screen-preview-placeholder">
            <p>{streaming ? "Waiting for frames…" : "Start the preview to capture your desktop"}</p>
          </div>
        )}
      </div>
      {pendingRect && (
        <div className="region-draft" aria-live="polite">
          <div>
            Proposed region: x={pendingRect.x}, y={pendingRect.y}, w={pendingRect.width}, h={pendingRect.height}
          </div>
          <div className="region-draft-form">
            <label>
              Region ID
              <input value={regionId} onChange={(e) => setRegionId(e.target.value)} placeholder="region-id" />
            </label>
            <label>
              Friendly name
              <input value={regionName} onChange={(e) => setRegionName(e.target.value)} placeholder="optional" />
            </label>
            <div className="region-draft-actions">
              <button type="button" onClick={handleAddRegion} disabled={!onRegionAdd}>
                Add region to profile
              </button>
              <button type="button" onClick={resetPending} className="ghost">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
