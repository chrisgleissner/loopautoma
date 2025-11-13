import { useCallback, useEffect, useState } from "react";
import { Event, Profile } from "./types";
import { listen } from "@tauri-apps/api/event";

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  return { profiles, setProfiles };
}

export function useEventStream() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<Event>("loopautoma://event", (e) => {
      setEvents((prev) => [...prev.slice(-499), e.payload]);
    }).then((off) => (unlisten = off));
    return () => {
      try { unlisten?.(); } catch {}
    };
  }, []);

  const clear = useCallback(() => setEvents([]), []);
  return { events, clear };
}

export function useRunState() {
  const [runningProfileId, setRunningProfileId] = useState<string | null>(null);
  return { runningProfileId, setRunningProfileId };
}
