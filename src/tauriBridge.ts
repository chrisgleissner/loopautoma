import { invoke } from "@tauri-apps/api/core";
import { ProfilesConfig, Rect, defaultProfilesConfig, normalizeProfilesConfig } from "./types";
import { BLANK_PNG_BASE64 } from "./testConstants";
import { getTestHarness, isDesktopEnvironment } from "./utils/runtime";

const isDesktopMode = () => isDesktopEnvironment();

async function callInvoke<T = unknown>(cmd: string, args?: any): Promise<T> {
  const harness = getTestHarness();
  if (harness?.invoke) {
    return harness.invoke(cmd, args);
  }
  return invoke(cmd, args);
}

export async function profilesLoad(): Promise<ProfilesConfig> {
  if (isDesktopMode()) return (await callInvoke("profiles_load")) as ProfilesConfig;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("loopautoma.profiles") : null;
    if (!raw) {
      const fallback = defaultProfilesConfig();
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("loopautoma.profiles", JSON.stringify(fallback));
      }
      return fallback;
    }
    const normalized = normalizeProfilesConfig(JSON.parse(raw));
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("loopautoma.profiles", JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return defaultProfilesConfig();
  }
}

export async function profilesSave(config: ProfilesConfig): Promise<void> {
  const normalized = normalizeProfilesConfig(config);
  if (isDesktopMode()) {
    await callInvoke("profiles_save", { config: normalized });
    return;
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("loopautoma.profiles", JSON.stringify(normalized));
    }
  } catch {
    // ignore — web preview persistence is best-effort
  }
}

export async function monitorStart(profileId: string): Promise<void> {
  if (!isDesktopMode()) return; // no-op in web preview
  await callInvoke("monitor_start", { profileId });
}

export async function monitorStop(): Promise<void> {
  if (!isDesktopMode()) return; // no-op in web preview
  await callInvoke("monitor_stop");
}

export async function windowPosition(): Promise<{ x: number; y: number }> {
  if (isDesktopMode()) {
    const [x, y] = (await callInvoke("window_position")) as [number, number];
    return { x, y };
  }
  return { x: 0, y: 0 };
}

export async function windowInfo(): Promise<{ x: number; y: number; scale: number }> {
  if (isDesktopMode()) {
    const [x, y, scale] = (await callInvoke("window_info")) as [number, number, number];
    return { x, y, scale };
  }
  return { x: 0, y: 0, scale: (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1 };
}

export type RegionPickPoint = { x: number; y: number };

export async function regionPickerShow(): Promise<void> {
  if (!isDesktopMode()) throw new Error("Region overlay requires desktop mode. Please run the Tauri app instead of the web preview.");
  await callInvoke("region_picker_show");
}

export async function regionPickerComplete(start: RegionPickPoint, end: RegionPickPoint): Promise<void> {
  if (!isDesktopMode()) throw new Error("Region overlay requires desktop mode. Please run the Tauri app instead of the web preview.");
  await callInvoke("region_picker_complete", { submission: { start, end } });
}

export async function regionPickerCancel(): Promise<void> {
  if (!isDesktopMode()) return; // treat as no-op in web preview
  await callInvoke("region_picker_cancel");
}

export async function appQuit(): Promise<void> {
  if (!isDesktopMode()) return; // handled by UI in web mode
  await callInvoke("app_quit");
}

export async function captureRegionThumbnail(rect: Rect): Promise<string | null> {
  if (!isDesktopMode()) return BLANK_PNG_BASE64;
  return (await callInvoke("region_capture_thumbnail", { rect })) as string | null;
}

export async function actionRecorderShow(): Promise<void> {
  if (!isDesktopMode()) {
    throw new Error("Action Recorder requires desktop mode. Please run the Tauri app instead of the web preview.");
  }
  await callInvoke("action_recorder_show");
}

export async function actionRecorderClose(): Promise<void> {
  if (!isDesktopMode()) return; // treat as no-op in web preview
  await callInvoke("action_recorder_close");
}

export async function actionRecorderComplete(actions: any[]): Promise<void> {
  if (!isDesktopMode()) return; // treat as no-op in web preview
  await callInvoke("action_recorder_complete", { actions });
}

// Audio notification functions
export async function audioTestIntervention(): Promise<void> {
  if (!isDesktopMode()) return; // no-op in web preview
  await callInvoke("audio_test_intervention");
}

export async function audioTestCompleted(): Promise<void> {
  if (!isDesktopMode()) return; // no-op in web preview
  await callInvoke("audio_test_completed");
}

export async function audioSetEnabled(enabled: boolean): Promise<void> {
  if (!isDesktopMode()) return; // no-op in web preview
  await callInvoke("audio_set_enabled", { enabled });
}

export async function audioGetEnabled(): Promise<boolean> {
  if (!isDesktopMode()) return false;
  return (await callInvoke("audio_get_enabled")) as boolean;
}

export async function audioSetVolume(volume: number): Promise<void> {
  if (!isDesktopMode()) return; // no-op in web preview
  await callInvoke("audio_set_volume", { volume });
}

export async function audioGetVolume(): Promise<number> {
  if (!isDesktopMode()) return 0.5;
  return (await callInvoke("audio_get_volume")) as number;
}

