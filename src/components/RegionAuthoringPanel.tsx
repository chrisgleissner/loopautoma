import { useCallback, useEffect, useState } from "react";
import { captureRegionThumbnail, regionPickerShow } from "../tauriBridge";
import { Rect, Region } from "../types";
import { subscribeEvent } from "../eventBridge";
import { MouseIcon, RefreshIcon, TrashIcon, PlusIcon } from "./Icons";

type RegionPickEventPayload = {
  rect: Rect;
  thumbnail_png_base64?: string | null;
};

export type RegionDraft = { rect: Rect; id?: string; name?: string };

type RegionAuthoringPanelProps = {
  regions?: Region[];
  disabled?: boolean;
  onRegionAdd?: (draft: RegionDraft) => Promise<void> | void;
  onRegionRemove?: (regionId: string) => Promise<void> | void;
  onRegionUpdate?: (regionId: string, newRect: Rect) => Promise<void> | void;
};

const toDataUrl = (value?: string | null): string | null => {
  if (!value) return null;
  return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
};

export function RegionAuthoringPanel({ regions, disabled, onRegionAdd, onRegionRemove, onRegionUpdate }: RegionAuthoringPanelProps) {
  const regionCount = regions?.length ?? 0;
  const [pending, setPending] = useState<{ rect: Rect; thumbnail?: string | null } | null>(null);
  const [pendingId, setPendingId] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [overlayActive, setOverlayActive] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
  const [thumbLoading, setThumbLoading] = useState<string | null>(null);
  const [redefiningRegionId, setRedefiningRegionId] = useState<string | null>(null);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    subscribeEvent<RegionPickEventPayload>("loopautoma://region_pick_complete", (payload) => {
      if (!payload) return;
      setOverlayActive(false);

      // Check if we're redefining an existing region
      if (redefiningRegionId && onRegionUpdate) {
        onRegionUpdate(redefiningRegionId, payload.rect);
        if (payload.thumbnail_png_base64) {
          setThumbnails((prev) => ({ ...prev, [redefiningRegionId]: payload.thumbnail_png_base64 ?? null }));
        }
        setRedefiningRegionId(null);
        setStatus("Region redefined successfully.");
        setError(null);
        return;
      }

      // Otherwise, create new pending region
      setPending({
        rect: payload.rect,
        thumbnail: payload.thumbnail_png_base64 ?? null,
      });
      setPendingId(`region-${Date.now().toString(36)}`);
      setPendingName(`Region ${regionCount + 1}`);
      setStatus("Region captured — review details below.");
      setError(null);
    }).then((off) => (dispose = off));
    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
    };
  }, [regionCount, redefiningRegionId, onRegionUpdate]);

  const launchOverlay = useCallback(async () => {
    if (disabled) {
      setError("Select a profile to capture regions.");
      return;
    }
    setError(null);
    setStatus("Opening overlay…");
    try {
      await regionPickerShow();
      setOverlayActive(true);
      setStatus("Overlay active — click and drag upper-left to lower-right on your desktop.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Unable to open overlay");
      setStatus(null);
      setOverlayActive(false);
    }
  }, [disabled]);

  const handleSavePending = useCallback(async () => {
    if (!pending || !onRegionAdd) return;
    const trimmedId = pendingId.trim();
    const regionId = trimmedId.length > 0 ? trimmedId : `region-${Date.now().toString(36)}`;
    const friendlyName = pendingName.trim() || undefined;

    // Issue 3: Validate for duplicate region ID or name
    const existingIds = new Set(regions?.map(r => r.id) || []);
    const existingNames = new Set(regions?.map(r => r.name).filter(Boolean) || []);

    if (existingIds.has(regionId)) {
      setError(`Region ID "${regionId}" already exists. Please choose a different ID.`);
      return;
    }

    if (friendlyName && existingNames.has(friendlyName)) {
      setError(`Region name "${friendlyName}" already exists. Please choose a different name.`);
      return;
    }

    try {
      await onRegionAdd({ rect: pending.rect, id: regionId, name: friendlyName });
      if (pending.thumbnail) {
        setThumbnails((prev) => ({ ...prev, [regionId]: pending.thumbnail ?? null }));
      }
      setPending(null);
      setPendingId("");
      setPendingName("");
      setStatus("Region added to profile.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to add region");
    }
  }, [onRegionAdd, pending, pendingId, pendingName]);

  const handleCancelPending = useCallback(() => {
    setPending(null);
    setPendingId("");
    setPendingName("");
    setStatus(null);
  }, []);

  const handleRemove = useCallback(
    async (regionId: string) => {
      if (!onRegionRemove) return;
      try {
        await onRegionRemove(regionId);
        setThumbnails((prev) => {
          const next = { ...prev };
          delete next[regionId];
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Failed to remove region");
      }
    },
    [onRegionRemove]
  );

  const refreshThumbnail = useCallback(async (region: Region) => {
    setThumbLoading(region.id);
    setError(null);
    try {
      const data = await captureRegionThumbnail(region.rect);
      setThumbnails((prev) => ({ ...prev, [region.id]: data ?? null }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Unable to refresh thumbnail");
    } finally {
      setThumbLoading((current) => (current === region.id ? null : current));
    }
  }, []);

  const redefineRegion = useCallback(async (regionId: string) => {
    setRedefiningRegionId(regionId);
    setError(null);
    setStatus("Opening overlay to redefine region…");
    try {
      await regionPickerShow();
      setOverlayActive(true);
      setStatus("Overlay active — click and drag to redefine the region boundaries.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Unable to open overlay");
      setStatus(null);
      setOverlayActive(false);
      setRedefiningRegionId(null);
    }
  }, []);

  useEffect(() => {
    if (!regions || regions.length === 0) {
      if (Object.keys(thumbnails).length > 0) {
        setThumbnails({});
      }
      return;
    }
    let cancelled = false;
    (async () => {
      for (const region of regions) {
        if (cancelled) return;
        if (thumbnails[region.id] !== undefined) {
          continue;
        }
        try {
          const data = await captureRegionThumbnail(region.rect);
          if (cancelled) return;
          setThumbnails((prev) => ({ ...prev, [region.id]: data ?? null }));
        } catch (err) {
          if (!cancelled) {
            console.warn("thumbnail capture failed", err);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [regions, thumbnails]);

  return (
    <div className="region-panel">
      <div className="region-panel-toolbar">
        <button
          type="button"
          className="icon-button accent"
          onClick={launchOverlay}
          disabled={disabled}
          title="Temporarily hide the app, drag a rectangle on your desktop, and capture a region thumbnail."
          aria-label="Define watch region"
        >
          <MouseIcon size={20} />
          <span className="sr-only">Define watch region</span>
        </button>
        <div className="region-overlay-hint">
          {overlayActive
            ? "Overlay active — drag with the left mouse button, then release to capture the region and return to LoopAutoma."
            : "Temporarily hides this app so you can drag over the desktop; releasing the mouse will capture the region and show a thumbnail here."}
        </div>
      </div>
      {status && <p className="region-status">{status}</p>}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {pending && (
        <div className="region-draft" aria-live="polite">
          <div>
            Proposed region: x={pending.rect.x}, y={pending.rect.y}, w={pending.rect.width}, h={pending.rect.height}
          </div>
          {pending.thumbnail && (
            <img
              src={toDataUrl(pending.thumbnail) ?? undefined}
              alt="Pending region preview"
              className="region-pending-thumb"
            />
          )}
          <div className="region-draft-form">
            <label>
              Region ID
              <input value={pendingId} onChange={(e) => setPendingId(e.target.value)} placeholder="region-id" />
            </label>
            <label>
              Friendly name
              <input value={pendingName} onChange={(e) => setPendingName(e.target.value)} placeholder="optional" />
            </label>
            <div className="region-draft-actions">
              <button type="button" onClick={handleSavePending} disabled={!onRegionAdd} title="Add region to profile">
                <span className="btn-icon" aria-hidden="true">
                  <PlusIcon size={18} />
                </span>
                Add region to profile
              </button>
              <button
                type="button"
                onClick={handleCancelPending}
                className="ghost"
                title="Discard pending region"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="region-list">
        {regions && regions.length > 0 ? (
          <ul className="region-grid">
            {regions.map((region) => {
              const thumb = toDataUrl(thumbnails[region.id]);
              const isThumbLoading = thumbLoading === region.id;
              return (
                <li key={region.id} className="region-card">
                  {thumb ? (
                    <img src={thumb} alt={`${region.name ?? region.id} thumbnail`} className="region-thumb" />
                  ) : (
                    <div className="region-thumb placeholder">No preview yet</div>
                  )}
                  <div className="region-meta">
                    <strong>{region.name || "Unnamed region"}</strong>
                    <code>{region.id}</code>
                    <span>
                      ({region.rect.x}, {region.rect.y}) · {region.rect.width}×{region.rect.height}
                    </span>
                    <div className="region-controls">
                      <button
                        type="button"
                        className={`icon-button${isThumbLoading ? " spinning" : ""}`}
                        onClick={() => refreshThumbnail(region)}
                        disabled={isThumbLoading}
                        title={isThumbLoading ? "Refreshing thumbnail" : "Refresh thumbnail"}
                        aria-label={isThumbLoading ? "Refreshing thumbnail" : "Refresh thumbnail"}
                      >
                        <RefreshIcon size={16} />
                        <span className="sr-only">Refresh thumbnail</span>
                      </button>
                      {onRegionUpdate && (
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => redefineRegion(region.id)}
                          disabled={overlayActive}
                          title="Redefine region boundaries"
                          aria-label="Redefine region"
                        >
                          <MouseIcon size={16} />
                          <span className="sr-only">Redefine</span>
                        </button>
                      )}
                      {onRegionRemove && (
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => handleRemove(region.id)}
                          title="Remove region"
                          aria-label="Remove region"
                        >
                          <TrashIcon size={16} />
                          <span className="sr-only">Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="region-empty" role="status">
            No regions captured yet. Use “Define watch region” to add one.
          </div>
        )}
      </div>
    </div>
  );
}
