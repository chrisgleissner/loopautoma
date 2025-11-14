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
  const dragRef = useRef<DragSelection | null>(null);
  const [pendingRect, setPendingRect] = useState<Rect | null>(null);
  const [regionName, setRegionName] = useState("");
  const [regionId, setRegionId] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamingRef = useRef(false);
  const canvasDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const frameBufferRef = useRef<Uint8ClampedArray | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const lastFrameMetaRef = useRef<{ checksum: number; drawnAt: number } | null>(null);
  const regionCount = regions?.length ?? 0;

  const sampleChecksum = useCallback((bytes: number[]) => {
    if (!bytes.length) return 0;
    const step = Math.max(1, Math.floor(bytes.length / 2048));
    let acc = 0;
    let visited = 0;
    for (let i = 0; i < bytes.length && visited < 4096; i += step) {
      acc = (acc + (bytes[i] ?? 0)) >>> 0;
      visited += 1;
    }
    return acc;
  }, []);

  const computeCanvasBounds = useCallback(
    (element: HTMLCanvasElement) => {
      const rect = element.getBoundingClientRect?.();
      const width = rect && rect.width > 0 ? rect.width : element.width || frame?.width || 0;
      const height = rect && rect.height > 0 ? rect.height : element.height || frame?.height || 0;
      if (width <= 0 || height <= 0) {
        console.warn("computeCanvasBounds width/height zero", { rect, width, height });
        return null;
      }
      if (rect && rect.width > 0 && rect.height > 0) {
        return rect;
      }
      const left = rect?.left ?? 0;
      const top = rect?.top ?? 0;
      return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: rect?.x ?? left,
        y: rect?.y ?? top,
        toJSON: rect?.toJSON ?? (() => ({})),
      } as DOMRect;
    },
    [frame],
  );

  const getClientCoordinate = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>, axis: "x" | "y", bounds: DOMRect) => {
      const primary = axis === "x" ? event.clientX : event.clientY;
      if (Number.isFinite(primary)) {
        return primary;
      }
      const nativeEvent = event.nativeEvent as PointerEvent & { __loopautomaInit?: PointerEventInit };
      const initValue = nativeEvent?.__loopautomaInit
        ? axis === "x"
          ? nativeEvent.__loopautomaInit.clientX
          : nativeEvent.__loopautomaInit.clientY
        : undefined;
      if (Number.isFinite(initValue)) {
        return Number(initValue);
      }
      if (nativeEvent) {
        const offset = axis === "x" ? nativeEvent.offsetX : nativeEvent.offsetY;
        if (Number.isFinite(offset)) {
          return (axis === "x" ? bounds.left : bounds.top) + Number(offset);
        }
        const pageCoord = axis === "x" ? nativeEvent.pageX : nativeEvent.pageY;
        if (Number.isFinite(pageCoord)) {
          return pageCoord;
        }
      }
      return axis === "x" ? bounds.left : bounds.top;
    },
    [],
  );

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

    const checksum = sampleChecksum(frame.bytes);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const last = lastFrameMetaRef.current;
    if (last && last.checksum === checksum && now - last.drawnAt < 300) {
      return;
    }

    let imageData = imageDataRef.current;
    if (!imageData || imageData.width !== frame.width || imageData.height !== frame.height) {
      imageData = (() => {
        if (typeof ctx.createImageData === "function") {
          return ctx.createImageData(frame.width, frame.height);
        }
        if (typeof ImageData !== "undefined") {
          try {
            return new ImageData(frame.width, frame.height);
          } catch {
            return new ImageData(new Uint8ClampedArray(frame.width * frame.height * 4), frame.width, frame.height);
          }
        }
        return {
          width: frame.width,
          height: frame.height,
          data: new Uint8ClampedArray(frame.width * frame.height * 4),
        } as ImageData;
      })();
      imageDataRef.current = imageData;
      frameBufferRef.current = imageData.data;
    }
    const buffer = frameBufferRef.current ?? imageData!.data;
    const limit = Math.min(buffer.length, frame.bytes.length);
    for (let i = 0; i < limit; i += 1) {
      buffer[i] = frame.bytes[i] ?? 0;
    }
    if (limit < buffer.length) {
      buffer.fill(0, limit);
    }
    ctx.putImageData(imageDataRef.current!, 0, 0);
    lastFrameMetaRef.current = { checksum, drawnAt: now };
  }, [frame, sampleChecksum]);

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
      const canvasElement = event.currentTarget;
      const bounds = canvasElement ? computeCanvasBounds(canvasElement) : null;
      if (!bounds) return;
      const resolvedWidth = bounds.width || frame.display.width || frame.width || 1;
      const resolvedHeight = bounds.height || frame.display.height || frame.height || 1;
      canvasDimensionsRef.current = { width: resolvedWidth, height: resolvedHeight };
      const clientX = getClientCoordinate(event, "x", bounds);
      const clientY = getClientCoordinate(event, "y", bounds);
      const x = clamp(clientX - bounds.left, 0, bounds.width);
      const y = clamp(clientY - bounds.top, 0, bounds.height);
      const next = { start: { x, y }, current: { x, y } };
      dragRef.current = next;
      setDrag(next);
      resetPending();
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    },
    [computeCanvasBounds, disabled, frame, getClientCoordinate, resetPending],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    setDrag((current) => {
      const active = dragRef.current ?? current;
      if (!active) {
        return current;
      }
      const canvasElement = canvasRef.current ?? event.currentTarget;
      const bounds = canvasElement ? computeCanvasBounds(canvasElement) : null;
      if (!bounds) {
        return current;
      }
      const resolvedWidth = bounds.width || frame?.display.width || frame?.width || 1;
      const resolvedHeight = bounds.height || frame?.display.height || frame?.height || 1;
      canvasDimensionsRef.current = { width: resolvedWidth, height: resolvedHeight };
      const clientX = getClientCoordinate(event, "x", bounds);
      const clientY = getClientCoordinate(event, "y", bounds);
      const x = clamp(clientX - bounds.left, 0, bounds.width);
      const y = clamp(clientY - bounds.top, 0, bounds.height);
      const next = { start: active.start, current: { x, y } };
      dragRef.current = next;
      return next;
    });
  }, [computeCanvasBounds, getClientCoordinate]);

  const finalizeDrag = useCallback((canvas?: HTMLCanvasElement | null) => {
    const selection = dragRef.current ?? drag;
    if (!selection || !frame) {
      setDrag(null);
      dragRef.current = null;
      return;
    }
    const target = canvas ?? canvasRef.current;
    if (target) {
      const bounds = target.getBoundingClientRect?.();
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        const resolvedWidth = bounds.width || frame?.display.width || frame?.width || 1;
        const resolvedHeight = bounds.height || frame?.display.height || frame?.height || 1;
        canvasDimensionsRef.current = { width: resolvedWidth, height: resolvedHeight };
      }
    }
    if (!canvasDimensionsRef.current) {
      setDrag(null);
      dragRef.current = null;
      return;
    }
    const rect = dragToScreenRect(selection, frame, canvasDimensionsRef.current);
    setDrag(null);
    dragRef.current = null;
    if (!rect) {
      return;
    }
    if (rect) {
      setPendingRect(rect);
      setRegionName((prev) => prev || `Region ${regionCount + 1}`);
      setRegionId(`region-${Date.now().toString(36)}`);
    }
  }, [drag, frame, regionCount]);

  const handlePointerTerminal = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      try {
        event.currentTarget?.releasePointerCapture?.(event.pointerId);
      } catch {}
      finalizeDrag(event.currentTarget);
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
