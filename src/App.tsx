import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";
import { ProfileSelector } from "./components/ProfileSelector";
import { EventLog } from "./components/EventLog";
import { ProfileEditor } from "./components/ProfileEditor";
import { RecordingBar, toActions } from "./components/RecordingBar";
import { RegionAuthoringPanel } from "./components/RegionAuthoringPanel";
import { GraphComposer } from "./components/GraphComposer";
import { CountdownTimer } from "./components/CountdownTimer";
import { ActionRecorderWindow, type RecordedAction } from "./components/ActionRecorderWindow";

import { useEventStream, useProfiles, useRunState } from "./store";
import { normalizeProfilesConfig, Profile, ProfilesConfig } from "./types";
import { monitorStart, monitorStop, profilesLoad, profilesSave, appQuit } from "./tauriBridge";
import logo from "../doc/img/logo.png";
import { useEffectOnce } from "./hooks/useEffectOnce";
import { registerBuiltins } from "./plugins/builtins";
import { isDesktopEnvironment } from "./utils/runtime";
import { AcceleratingNumberInput } from "./components/AcceleratingNumberInput";
import { getCurrentWindow } from "@tauri-apps/api/window";

const THEME_STORAGE_KEY = "loopautoma.theme";
const PALETTE_STORAGE_KEY = "loopautoma.palette";

const isTestEnvironment = typeof import.meta !== "undefined" &&
  ((import.meta as unknown as { vitest?: boolean }).vitest || import.meta.env?.MODE === "test");

type ThemeChoice = "system" | "light" | "dark";
type PaletteChoice = "serene" | "noir" | "sunrise";

type PaletteOption = {
  id: PaletteChoice;
  label: string;
  swatch: [string, string];
};

const paletteOptions: PaletteOption[] = [
  { id: "serene", label: "Serene Cyan", swatch: ["#59d0ff", "#6ef3a5"] },
  { id: "sunrise", label: "Sunrise Amber", swatch: ["#f6ae2d", "#f26419"] },
  { id: "noir", label: "Noir Violet", swatch: ["#a78bfa", "#6366f1"] },
];

const themeOptions: { id: ThemeChoice; label: string; icon: JSX.Element }[] = [
  {
    id: "system",
    label: "System theme",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2" ry="2" fill="currentColor" opacity="0.25" />
        <rect x="5" y="6" width="14" height="8" rx="1.2" ry="1.2" stroke="currentColor" fill="none" strokeWidth="1.5" />
        <rect x="10" y="18" width="4" height="1.5" rx="0.75" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "light",
    label: "Light theme",
    icon: (
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
    ),
  },
  {
    id: "dark",
    label: "Dark theme",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M21 12.5A8.5 8.5 0 1 1 11.5 3a7 7 0 1 0 9.5 9.5Z" fill="currentColor" />
      </svg>
    ),
  },
];

export function App() {
  // Check if we're in the action-recorder window
  const windowLabel = useMemo(() => {
    try {
      return getCurrentWindow().label;
    } catch {
      return "main";
    }
  }, []);

  // If this is the action-recorder window, render only that component
  if (windowLabel === "action-recorder") {
    return <ActionRecorderWindow />;
  }

  return <MainWindow />;
}

function MainWindow() {
  const { config, setConfig } = useProfiles();
  const { events, clear } = useEventStream();
  const { runningProfileId, setRunningProfileId } = useRunState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(true);
  const [theme, setTheme] = useState<ThemeChoice>("dark");
  const [palette, setPalette] = useState<PaletteChoice>("serene");
  const [fontSize, setFontSize] = useState(13);
  const profiles = config?.profiles ?? [];

  // Use ref to ensure we always have latest profile in event listener
  const selectedProfileRef = useRef<Profile | null>(null);

  useEffectOnce(() => {
    registerBuiltins();
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (!isTestEnvironment) {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeChoice | null;
      if (savedTheme) {
        setTheme(savedTheme);
      }
    } else {
      setTheme("dark");
    }
    const savedPalette = window.localStorage.getItem(PALETTE_STORAGE_KEY) as PaletteChoice | null;
    if (savedPalette) {
      setPalette(savedPalette);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(PALETTE_STORAGE_KEY, palette);
    if (!isTestEnvironment) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [palette, theme]);

  const applyConfig = useCallback(
    async (next: ProfilesConfig) => {
      const normalized = normalizeProfilesConfig(next);
      setConfig(normalized);
      setSelectedId((prev) => {
        if (prev && normalized.profiles.some((p) => p.id === prev)) {
          return prev;
        }
        return normalized.profiles[0]?.id ?? null;
      });
      await profilesSave(normalized);
    },
    [setConfig],
  );

  useEffect(() => {
    let cancelled = false;
    const countProfiles = (input: unknown): number => {
      if (!input) return 0;
      if (Array.isArray((input as ProfilesConfig).profiles)) {
        return ((input as ProfilesConfig).profiles ?? []).length;
      }
      if (Array.isArray(input)) {
        return input.length;
      }
      return 0;
    };

    (async () => {
      try {
        const cfg = await profilesLoad();
        if (cancelled) return;
        const normalized = normalizeProfilesConfig(cfg);
        if (countProfiles(cfg) === 0) {
          if (!cancelled) {
            await applyConfig(normalized);
          }
          return;
        }
        setConfig(normalized);
        setSelectedId(normalized.profiles[0]?.id ?? null);
      } catch {
        if (cancelled) return;
        const fallback = normalizeProfilesConfig(undefined);
        await applyConfig(fallback);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyConfig, setConfig]);

  const start = useCallback(async () => {
    if (!selectedId) return;
    await monitorStart(selectedId);
    setRunningProfileId(selectedId);
  }, [selectedId, setRunningProfileId]);

  const stop = useCallback(async () => {
    await monitorStop();
    setRunningProfileId(null);
  }, [setRunningProfileId]);

  const selectedProfile = useMemo(() => profiles.find((p) => p.id === selectedId) ?? null, [profiles, selectedId]);
  const isRunning = Boolean(runningProfileId);

  // Keep ref in sync with selectedProfile
  useEffect(() => {
    selectedProfileRef.current = selectedProfile;
  }, [selectedProfile]);

  const updateProfile = useCallback(async (updated: Profile) => {
    // Always fetch fresh config to avoid stale closure when called from async event listeners
    const freshConfig = await profilesLoad();
    const idx = freshConfig.profiles.findIndex((p) => p.id === updated.id);
    const nextProfiles = idx >= 0
      ? [...freshConfig.profiles.slice(0, idx), updated, ...freshConfig.profiles.slice(idx + 1)]
      : [...freshConfig.profiles, updated];
    await applyConfig({ version: freshConfig.version, profiles: nextProfiles });
  }, [applyConfig]);

  // Subscribe to action recorder complete events
  useEffect(() => {
    if (!isDesktopEnvironment()) return;

    const unlisten = (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        return await listen<RecordedAction[]>("loopautoma://action_recorder_complete", async (event) => {
          const actions = event.payload;
          const currentProfile = selectedProfileRef.current;

          if (!currentProfile) {
            console.warn("[App] No selected profile, skipping action save");
            return;
          }
          if (actions.length === 0) {
            console.log("[App] No actions recorded, but closing normally");
            return;
          }

          console.log("[App] Received", actions.length, "recorded action(s):", actions);

          // Convert RecordedAction[] to profile actions
          const events = actions.map((action) => {
            if (action.type === "click") {
              return {
                t: "click" as const,
                button: action.button,
                x: action.x,
                y: action.y,
              };
            } else {
              return {
                t: "type" as const,
                text: action.text,
              };
            }
          });

          console.log("[App] Starting transformation of", events.length, "event(s)");
          const newActions = toActions(events);
          console.log("[App] Transformed to", newActions.length, "actions:", newActions);

          // REPLACE the entire action sequence (not append) as user requested
          const updatedProfile = {
            ...currentProfile,
            actions: newActions,
          };
          console.log("[App] REPLACING action sequence. Before:", currentProfile.actions.length, "After:", updatedProfile.actions.length);
          console.log("[App] Updated profile:", JSON.stringify(updatedProfile, null, 2));

          try {
            await updateProfile(updatedProfile);
            console.log("[App] Profile update completed successfully");

            // Force verify the config was actually updated
            const verifyConfig = await profilesLoad();
            console.log("[App] Verification - Config reloaded:", JSON.stringify(verifyConfig.profiles[0]?.actions, null, 2));
            console.log("[App] Actions should now be visible in GraphComposer");
          } catch (err) {
            console.error("[App] ERROR updating profile:", err);
          }
        });
      } catch (err) {
        console.error("[App] Failed to set up action recorder event listener:", err);
        return undefined;
      }
    })();

    return () => {
      void unlisten.then((fn) => fn?.());
    };
  }, [updateProfile]); // selectedProfile accessed via ref, not closure

  const quitApp = useCallback(async () => {
    try {
      if (isDesktopEnvironment()) {
        await appQuit();
        return;
      }
      if (typeof window !== "undefined") {
        console.info("Quit requested in web dev mode; close the tab/window manually.");
      }
    } catch (err) {
      console.error("Unable to quit Loop Automa:", err);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--base-font-size", `${fontSize}px`);
  }, [fontSize]);

  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 1, 20));
  const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 1, 10));

  const themeAttr = theme === "system" ? undefined : theme;

  return (
    <main className="container" data-theme={themeAttr} data-palette={palette}>
      <header className="brand">
        <div className="brand-left">
          <div className="brand-logo-wrap">
            <img src={logo} alt="Loop Automa" className="brand-logo" />
          </div>
          <div className="brand-title">
            <h1 title="Compose automations to keep your agent moving">Loop Automa</h1>
            <p className="muted">Guardrail-first automation studio that watches regions and keeps your agent moving.</p>
          </div>
        </div>
        <div className="top-right">
          <div className="font-size-controls" role="group" aria-label="Font size">
            <button
              className="font-size-btn"
              onClick={decreaseFontSize}
              title="Decrease font size"
              aria-label="Decrease font size"
            >
              −
            </button>
            <button
              className="font-size-btn"
              onClick={increaseFontSize}
              title="Increase font size"
              aria-label="Increase font size"
            >
              +
            </button>
          </div>
          <div className="theme-icons" role="group" aria-label="Color theme">
            {themeOptions.map((item) => (
              <button
                key={item.id}
                className={`icon-btn ${theme === item.id ? "active" : ""}`}
                onClick={() => setTheme(item.id)}
                title={item.label}
                aria-pressed={theme === item.id}
                aria-label={item.label}
              >
                {item.icon}
              </button>
            ))}
          </div>
          <div className="palette-picker" role="group" aria-label="Accent palette">
            {paletteOptions.map((option) => (
              <button
                key={option.id}
                className={`palette-btn ${palette === option.id ? "active" : ""}`}
                onClick={() => setPalette(option.id)}
                title={`${option.label} palette`}
                aria-label={`${option.label} palette`}
              >
                <span className="palette-swatch" aria-hidden="true">
                  <span style={{ backgroundColor: option.swatch[0] }} />
                  <span style={{ backgroundColor: option.swatch[1] }} />
                </span>
              </button>
            ))}
          </div>
          <div className="framework-badges" title="Powered by Vite, Tauri, and React">
            <a href="https://vite.dev" target="_blank" aria-label="Vite" rel="noreferrer">
              <img src="/vite.svg" className="badge" alt="Vite" />
            </a>
            <a href="https://tauri.app" target="_blank" aria-label="Tauri" rel="noreferrer">
              <img src="/tauri.svg" className="badge" alt="Tauri" />
            </a>
            <a href="https://react.dev" target="_blank" aria-label="React" rel="noreferrer">
              <img src={reactLogo} className="badge" alt="React" />
            </a>
          </div>
          <button className="danger" onClick={quitApp} title="Quit Loop Automa window">
            Quit
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <article className="panel card monitor-panel" aria-label="Monitor configuration">
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon" aria-hidden="true">⏱️</span>
              <div>
                <h2>Monitor planner</h2>
                <p className="muted">Pick a profile, tune guardrails, then start the loop.</p>
              </div>
            </div>
            {isRunning && (
              <span className="running-chip" aria-live="polite" title="Monitor is running">
                Running
              </span>
            )}
          </div>

          <div className="monitor-toolbar" role="group" aria-label="Profile selection">
            <label className="sr-only" htmlFor="profile-select">
              Select profile
            </label>
            <ProfileSelector
              profiles={profiles}
              value={selectedId}
              onChange={(id) => setSelectedId(id)}
              inputId="profile-select"
            />
            <div className="monitor-actions">
              <button
                className={`primary ${isRunning ? "danger" : ""}`}
                onClick={isRunning ? stop : start}
                disabled={!isRunning && !selectedId}
                title={isRunning ? "Stop immediately" : "Start the monitor loop with the selected profile"}
              >
                <span className="btn-icon" aria-hidden="true">
                  {isRunning ? (
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <path d="M8 5v14l10-7z" />
                    </svg>
                  )}
                </span>
                {isRunning ? "Stop" : "Start"}
              </button>

            </div>
          </div>

          {isRunning && <CountdownTimer />}

          {selectedProfile && (
            <div className="guardrail-controls" aria-label="Guardrail inputs">
              <div className="guardrail-label">
                <span className="panel-icon" aria-hidden="true">🛡️</span>
                <strong>Guardrails</strong>
              </div>
              <label>
                Cooldown (s)
                <AcceleratingNumberInput
                  min={0}
                  value={selectedProfile.guardrails?.cooldown_ms !== undefined ? selectedProfile.guardrails.cooldown_ms / 1000 : ""}
                  onValueChange={async (seconds) => {
                    const safeSeconds = seconds === "" ? 0 : Number(seconds);
                    const next = {
                      ...(selectedProfile.guardrails ?? { cooldown_ms: 0 }),
                      cooldown_ms: Math.max(0, safeSeconds * 1000),
                    };
                    await updateProfile({ ...selectedProfile, guardrails: next });
                  }}
                />
              </label>
              <label>
                Max runtime (s)
                <AcceleratingNumberInput
                  min={0}
                  value={selectedProfile.guardrails?.max_runtime_ms !== undefined ? selectedProfile.guardrails.max_runtime_ms / 1000 : ""}
                  onValueChange={async (seconds) => {
                    const parsed = seconds === "" ? undefined : Number(seconds);
                    let next = { ...(selectedProfile.guardrails ?? { cooldown_ms: 0 }) } as Profile["guardrails"] & { max_runtime_ms?: number };
                    if (parsed === undefined) {
                      const { max_runtime_ms, ...rest } = next ?? {};
                      next = rest as typeof next;
                    } else {
                      next = { ...next, max_runtime_ms: Math.max(0, parsed * 1000) };
                    }
                    await updateProfile({ ...selectedProfile, guardrails: next });
                  }}
                  placeholder="unset"
                />
              </label>
              <label>
                Max activations/hour
                <AcceleratingNumberInput
                  min={0}
                  value={selectedProfile.guardrails?.max_activations_per_hour ?? ""}
                  onValueChange={async (nextValue) => {
                    const parsed = nextValue === "" ? undefined : Number(nextValue);
                    await updateProfile({
                      ...selectedProfile,
                      guardrails: { ...(selectedProfile.guardrails ?? { cooldown_ms: 0 }), max_activations_per_hour: parsed },
                    });
                  }}
                  placeholder="unset"
                />
              </label>
            </div>
          )}


        </article>

        <article className="panel card events-panel" aria-label="Event log">
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon" aria-hidden="true">📡</span>
              <div>
                <h3>Events</h3>
                <p className="muted">Live stream from the monitor runtime.</p>
              </div>
            </div>
            <button className="ghost" onClick={clear} title="Clear the events list (does not stop the monitor)">
              Clear log
            </button>
          </div>
          <EventLog events={events} />
        </article>

        <article className="panel card recording-panel" aria-label="Recording bar">
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon" aria-hidden="true">🎬</span>
              <div>
                <h3>Recording</h3>
                <p className="muted">Capture mouse/keyboard actions into reusable steps.</p>
              </div>
            </div>
          </div>
          <RecordingBar />
        </article>

        <article className="panel card regions-panel" aria-label="Regions">
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon" aria-hidden="true">🖼️</span>
              <div>
                <h3>Regions</h3>
                <p className="muted">Capture on-screen areas for conditions and prompts.</p>
              </div>
            </div>
          </div>
          <RegionAuthoringPanel
            regions={selectedProfile?.regions}
            disabled={!selectedProfile}
            onRegionAdd={async (draft) => {
              if (!selectedProfile) return;
              const nextId = draft.id && draft.id.trim().length > 0 ? draft.id.trim() : `region-${Date.now().toString(36)}`;
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
        </article>

        <article className="panel card graph-panel" aria-label="Graphical composer">
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon" aria-hidden="true">🧩</span>
              <div>
                <h3>Graphical Composer</h3>
                <p className="muted">Visually edit Trigger → Condition → ActionSequence.</p>
              </div>
            </div>
            <label className="toggle" title="Hide or show the graphical composer">
              <input type="checkbox" checked={showGraph} onChange={(e) => setShowGraph(e.target.checked)} /> Show
            </label>
          </div>
          {showGraph ? (
            <GraphComposer profile={selectedProfile} onChange={updateProfile} />
          ) : (
            <p className="muted" role="status">
              Composer hidden. Toggle “Show” to edit the graph.
            </p>
          )}
        </article>

        <article className="panel card json-panel" aria-label="Configuration JSON">
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon" aria-hidden="true">{ }</span>
              <div>
                <h3>Configuration JSON</h3>
                <p className="muted">Advanced: edit the entire workspace config.</p>
              </div>
            </div>
          </div>
          <ProfileEditor config={config} onChange={applyConfig} />
        </article>
      </section>
    </main>
  );
}

export default App;
