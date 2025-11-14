import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { regionPickerComplete, RegionPickPoint } from "../tauriBridge";

function toCssRect(start: Point, current: Point) {
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  return { left, top, width, height };
}

export type Point = { x: number; y: number };

type MonitorInfo = {
  position: { x: number; y: number };
  scaleFactor: number;
};

export function RegionOverlay() {
  const pickerWindow = useMemo(() => getCurrentWindow(), []);
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [status, setStatus] = useState<string>("Click upper-left corner");
  const [error, setError] = useState<string | null>(null);
  const monitorRef = useRef<MonitorInfo>({ position: { x: 0, y: 0 }, scaleFactor: 1 });
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const outer = await pickerWindow.outerPosition();
        if (!mounted) return;
        monitorRef.current = {
          position: {
            x: outer?.x ?? 0,
            y: outer?.y ?? 0,
          },
          scaleFactor: window.devicePixelRatio || 1,
        };
      } catch (err) {
        console.warn("overlay position lookup failed", err);
      }
    })();
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";
    return () => {
      mounted = false;
      document.body.style.cursor = prevCursor;
    };
  }, [pickerWindow]);

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        void pickerWindow.close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pickerWindow]);

  const overlayStatus = useMemo(() => {
    if (error) return error;
    if (!start) return status;
    return "Release to confirm lower-right corner";
  }, [error, start, status]);

  const toGlobal = (point: Point): RegionPickPoint => {
    const monitor = monitorRef.current;
    const scale = monitor.scaleFactor || 1;
    return {
      x: Math.round(monitor.position.x + point.x * scale),
      y: Math.round(monitor.position.y + point.y * scale),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement)?.closest?.(".region-overlay-hud")) {
      return;
    }
    const pt = { x: event.clientX, y: event.clientY };
    setStart(pt);
    setCurrent(pt);
    setStatus("Drag to lower-right corner");
    rootRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!start) return;
    setCurrent({ x: event.clientX, y: event.clientY });
  };

  const handlePointerUp = async (event: React.PointerEvent<HTMLDivElement>) => {
    if (!start) return;
    rootRef.current?.releasePointerCapture(event.pointerId);
    const endPoint = { x: event.clientX, y: event.clientY };
    setCurrent(endPoint);
    try {
  await regionPickerComplete(toGlobal(start), toGlobal(endPoint));
  await pickerWindow.close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Unable to record region");
    }
  };

  const selection = start && current ? toCssRect(start, current) : null;

  return (
    <div
      ref={rootRef}
      className="region-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="region-overlay-hud" onPointerDown={(e) => e.stopPropagation()}>
        <div>
          <h2>Define watch region</h2>
          <p>{overlayStatus}</p>
        </div>
        <button type="button" onClick={() => pickerWindow.close()}>
          Cancel
        </button>
      </div>
      {selection && (
        <div
          className="region-overlay-rect"
          style={{
            left: selection.left,
            top: selection.top,
            width: selection.width,
            height: selection.height,
          }}
        />
      )}
    </div>
  );
}
