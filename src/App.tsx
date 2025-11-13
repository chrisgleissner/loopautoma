import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";
import { ProfileSelector } from "./components/ProfileSelector";
import { EventLog } from "./components/EventLog";
import { ProfileEditor } from "./components/ProfileEditor";
import { useEventStream, useProfiles, useRunState } from "./store";
import { defaultPresetProfile, Profile } from "./types";
import { monitorStart, monitorStop, profilesLoad, profilesSave } from "./tauriBridge";

function App() {
  const { profiles, setProfiles } = useProfiles();
  const { events, clear } = useEventStream();
  const { runningProfileId, setRunningProfileId } = useRunState();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <main className="container">
      <h1>Loop Automa</h1>

      <div className="row">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>Profile:</label>
          <ProfileSelector
            profiles={profiles}
            value={selectedId}
            onChange={(id) => setSelectedId(id)}
          />
          <button onClick={start} disabled={!selectedId || !!runningProfileId}>
            Start
          </button>
          <button onClick={stop} disabled={!runningProfileId}>
            Panic Stop
          </button>
          <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>
            State: {runningProfileId ? "Running" : "Stopped"}
          </span>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Events</h3>
            <button onClick={clear}>Clear</button>
          </div>
          <EventLog events={events} />
        </div>

        <div>
          <h3 style={{ margin: 0 }}>Profile JSON</h3>
          <ProfileEditor profile={selectedProfile} onChange={updateProfile} />
        </div>
      </section>
    </main>
  );
}

export default App;
