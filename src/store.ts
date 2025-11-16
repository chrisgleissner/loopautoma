import { useCallback, useEffect, useState } from "react";
import { Event as RuntimeEvent, ProfilesConfig } from "./types";
import { subscribeEvent } from "./eventBridge";

export function useProfiles() {
  const [config, setConfig] = useState<ProfilesConfig | null>(null);
  return { config, setConfig };
}

export function useEventStream() {
  const [events, setEvents] = useState<RuntimeEvent[]>([]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    subscribeEvent<RuntimeEvent>("loopautoma://event", (payload) => {
      if (!payload) return;
      setEvents((prev) => [...prev.slice(-499), payload]);
    }).then((off) => (dispose = off));
    return () => {
      try {
        dispose?.();
      } catch {}
    };
  }, []);

  const clear = useCallback(() => setEvents([]), []);
  return { events, clear };
}

export function useRunState() {
  const [runningProfileId, setRunningProfileId] = useState<string | null>(null);
  useEffect(() => {
    let dispose: (() => void) | undefined;
    subscribeEvent<RuntimeEvent>("loopautoma://event", (payload) => {
      if (payload?.type === "MonitorStateChanged" && (payload as any).state !== "Running") {
        setRunningProfileId(null);
      }
    }).then((off) => (dispose = off));
    return () => {
      try {
        dispose?.();
      } catch {}
    };
  }, []);
  return { runningProfileId, setRunningProfileId };
}
