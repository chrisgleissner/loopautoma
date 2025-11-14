import { useCallback, useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";
import { ProfileSelector } from "./components/ProfileSelector";
import { EventLog } from "./components/EventLog";
import { ProfileEditor } from "./components/ProfileEditor";
import { RecordingBar, toActions } from "./components/RecordingBar";
import { RegionAuthoringPanel } from "./components/RegionAuthoringPanel";
import { GraphComposer } from "./components/GraphComposer";
import { ProfileInsights } from "./components/ProfileInsights";
import { useEventStream, useProfiles, useRunState } from "./store";
import { defaultPresetProfile, Profile } from "./types";
import { monitorStart, monitorStop, profilesLoad, profilesSave } from "./tauriBridge";
import logo from "../doc/img/logo.png";
import { useEffectOnce } from "./hooks/useEffectOnce";
import { registerBuiltins } from "./plugins/builtins";
import { appWindow } from "@tauri-apps/api/window";

function App() {
  const { profiles, setProfiles } = useProfiles();
  const { events, clear } = useEventStream();
  const { runningProfileId, setRunningProfileId } = useRunState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(true);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  useEffectOnce(() => {
    registerBuiltins();
  });

  useEffect(() => {
    // Load profiles from backend; seed default if none
    profilesLoad()
      .then((ps) => {
        if (!ps || ps.length === 0) {
          const preset = defaultPresetProfile();
          setProfiles([preset]);
          setSelectedId(preset.id);
          return profilesSave([preset]);
        } else {
          setProfiles(ps);
          setSelectedId(ps[0].id);
        }
      })
      .catch(() => {
        const preset = defaultPresetProfile();
        setProfiles([preset]);
        setSelectedId(preset.id);
      });
  }, [setProfiles]);

  const start = async () => {
    if (!selectedId) return;
    await monitorStart(selectedId);
    setRunningProfileId(selectedId);
  };
  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null;
  const isRunning = !!runningProfileId;

  const restorePreset = useCallback(async () => {
    const preset = defaultPresetProfile();
    const remaining = profiles.filter((p) => p.id !== preset.id);
    const next = [preset, ...remaining];
    setProfiles(next);
    setSelectedId(preset.id);
    await profilesSave(next);
  }, [profiles, setProfiles]);

  const updateProfile = async (updated: any) => {
    const idx = profiles.findIndex((p) => p.id === updated.id);
    let next: Profile[];
    if (idx >= 0) {
      next = [...profiles.slice(0, idx), updated, ...profiles.slice(idx + 1)];
    } else {
      next = [...profiles, updated];
    }
    setProfiles(next);
    await profilesSave(next);
  };

  const stop = async () => {
    await monitorStop();
    setRunningProfileId(null);
  };

  const quitApp = useCallback(async () => {
    try {
      if (typeof window !== "undefined" && (window as any).__TAURI_IPC__) {
        await appWindow.close();
      } else {
        window.close();
      }
    } catch (err) {
      console.error("Unable to quit Loop Automa:", err);
    }
  }, []);

  // theme handling: apply data-theme attribute; system is default via CSS
  const themeAttr = theme === "system" ? undefined : theme;

  return (
    <main className="container" data-theme={themeAttr}>
      <div className="brand">
        <img src={logo} alt="Loop Automa" className="brand-logo" />
        <div className="brand-title">
          <h1 title="Compose automations to keep your agent moving">Loop Automa</h1>
        </div>
        <div className="top-right">
          <div className="theme-icons" role="group" aria-label="Color theme">
            <button
              className={`icon-btn ${theme === "system" ? "active" : ""}`}
              onClick={() => setTheme("system")}
              title="Use system theme"
              aria-label="System theme"
            >
              {/* monitor icon */}
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <rect x="3" y="4" width="18" height="12" rx="2" ry="2" fill="currentColor" opacity="0.2" />
                <rect x="5" y="6" width="14" height="8" rx="1.2" ry="1.2" stroke="currentColor" fill="none" strokeWidth="1.5" />
                <rect x="10" y="18" width="4" height="1.5" rx="0.75" fill="currentColor" />
              </svg>
            </button>
            <button
              className={`icon-btn ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")}
              title="Light theme"
              aria-label="Light theme"
            >
              {/* sun icon */}
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="4" fill="currentColor" />
                <g stroke="currentColor" strokeWidth="1.5">
                  <line x1="12" y1="2" x2="12" y2="5" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="5" y2="12" />
                  <line x1="19" y1="12" x2="22" y2="12" />
                  <line x1="4.2" y1="4.2" x2="6.3" y2="6.3" />
                  <line x1="17.7" y1="17.7" x2="19.8" y2="19.8" />
                  <line x1="17.7" y1="6.3" x2="19.8" y2="4.2" />
                  <line x1="4.2" y1="19.8" x2="6.3" y2="17.7" />
                </g>
              </svg>
            </button>
            <button
              className={`icon-btn ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
              title="Dark theme"
              aria-label="Dark theme"
            >
              {/* moon icon */}
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M21 12.5A8.5 8.5 0 1 1 11.5 3a7 7 0 1 0 9.5 9.5Z" fill="currentColor" />
              </svg>
            </button>
          </div>
          <div className="framework-badges" title="Powered by Vite, Tauri, and React">
            <a href="https://vite.dev" target="_blank" aria-label="Vite">
              <img src="/vite.svg" className="badge" alt="Vite" />
            </a>
            <a href="https://tauri.app" target="_blank" aria-label="Tauri">
              <img src="/tauri.svg" className="badge" alt="Tauri" />
            </a>
            <a href="https://react.dev" target="_blank" aria-label="React">
              <img src={reactLogo} className="badge" alt="React" />
            </a>
          </div>
          <button
            className="danger"
            onClick={quitApp}
            title="Quit LoopAutoma"
          >
            Quit
          </button>
        </div>
      </div>
      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label title="Pick or change the active automation profile">Profile:</label>
          <ProfileSelector
            profiles={profiles}
            value={selectedId}
            onChange={(id) => setSelectedId(id)}
          />
          <button
            onClick={isRunning ? stop : start}
            disabled={!isRunning && !selectedId}
            title={isRunning ? "Stop immediately" : "Start the monitor loop with the selected profile"}
          >
            {isRunning ? "Stop" : "Start"}
          </button>
          {isRunning && (
            <span className="running-chip" aria-live="polite" title="Monitor is running">Running</span>
          )}
        </div>

        {selectedProfile && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <strong>Guardrails:</strong>
            <label>
              Cooldown (ms)
              <input
                type="number"
                value={selectedProfile.guardrails?.cooldown_ms ?? 0}
                onChange={async (e) => {
                  const v = Number(e.target.value || 0);
                  await updateProfile({ ...selectedProfile, guardrails: { ...(selectedProfile.guardrails ?? { cooldown_ms: 0 }), cooldown_ms: v } });
                }}
                style={{ width: 120, marginLeft: 6 }}
              />
            </label>
            <label>
              Max runtime (ms)
              <input
                type="number"
                value={selectedProfile.guardrails?.max_runtime_ms ?? ""}
                onChange={async (e) => {
                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                  await updateProfile({ ...selectedProfile, guardrails: { ...(selectedProfile.guardrails ?? { cooldown_ms: 0 }), max_runtime_ms: v } });
                }}
                placeholder="unset"
                style={{ width: 140, marginLeft: 6 }}
              />
            </label>
            <label>
              Max activations/hour
              <input
                type="number"
                value={selectedProfile.guardrails?.max_activations_per_hour ?? ""}
                onChange={async (e) => {
                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                  await updateProfile({ ...selectedProfile, guardrails: { ...(selectedProfile.guardrails ?? { cooldown_ms: 0 }), max_activations_per_hour: v } });
                }}
                placeholder="unset"
                style={{ width: 120, marginLeft: 6 }}
              />
            </label>
          </div>
        )}

        <ProfileInsights profile={selectedProfile} onRestorePreset={() => { void restorePreset(); }} />

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }} title="Live stream of runtime events from the monitor">Events</h3>
            <button onClick={clear} title="Clear the events list (does not stop the monitor)">Clear</button>
          </div>
          <EventLog events={events} />
        </div>

        <div>
          <h3 style={{ margin: 0 }} title="Capture a sequence of mouse/keyboard actions to reuse as an ActionSequence">Recording</h3>
          <RecordingBar
            onSave={async (evts) => {
              if (!selectedProfile) return;
              const newActions = toActions(evts);
              await updateProfile({
                ...selectedProfile,
                actions: [...selectedProfile.actions, ...newActions],
              });
            }}
          />
        </div>

        <div>
          <h3 style={{ margin: 0 }} title="Capture on-screen regions via the transparent overlay and review saved areas">Regions</h3>
          <RegionAuthoringPanel
            regions={selectedProfile?.regions}
            disabled={!selectedProfile}
            onRegionAdd={async (draft) => {
              if (!selectedProfile) return;
              const nextId = draft.id && draft.id.trim().length > 0
                ? draft.id.trim()
                : `region-${Date.now().toString(36)}`;
              const region = {
                id: nextId,
                rect: draft.rect,
                name: draft.name?.trim() || undefined,
              };
              await updateProfile({
                ...selectedProfile,
                regions: [...selectedProfile.regions, region],
              });
            }}
            onRegionRemove={async (regionId) => {
              if (!selectedProfile) return;
              await updateProfile({
                ...selectedProfile,
                regions: selectedProfile.regions.filter((region) => region.id !== regionId),
              });
            }}
          />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }} title="Visually edit Trigger → Condition → ActionSequence for the selected profile">Graphical Composer</h3>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={showGraph} onChange={(e) => setShowGraph(e.target.checked)} /> Show
            </label>
          </div>
          {showGraph && (
            <GraphComposer profile={selectedProfile} onChange={updateProfile} />
          )}
        </div>

        <div>
          <h3 style={{ margin: 0 }} title="Advanced: edit the underlying profile configuration directly as JSON">Profile JSON</h3>
          <ProfileEditor profile={selectedProfile} onChange={updateProfile} />
        </div>
      </section>
    </main>
  );
}

export default App;
