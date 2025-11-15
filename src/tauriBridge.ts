import { invoke } from "@tauri-apps/api/core";
import { Profile, Rect, defaultPresetProfile } from "./types";
import { BLANK_PNG_BASE64 } from "./testConstants";

type TestHarness = {
  state?: Record<string, unknown>;
  emit?: (channel: string, payload: unknown) => void;
  invoke?: (cmd: string, args?: unknown) => Promise<any>;
};

const hasWindow = typeof window !== "undefined";
const getHarness = (): TestHarness | undefined => (hasWindow ? (window as any).__LOOPAUTOMA_TEST__ : undefined);

const isDesktopMode = () => hasWindow && ((window as any).__TAURI_IPC__ || getHarness()?.invoke);

async function callInvoke<T = unknown>(cmd: string, args?: any): Promise<T> {
  const harness = getHarness();
  if (harness?.invoke) {
    return harness.invoke(cmd, args);
  }
  return invoke(cmd, args);
}

export async function profilesLoad(): Promise<Profile[]> {
  if (isDesktopMode()) return (await callInvoke("profiles_load")) as Profile[];
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("loopautoma.profiles") : null;
    if (!raw) return [defaultPresetProfile()];
    const parsed = JSON.parse(raw) as Profile[];
    return parsed && parsed.length > 0 ? parsed : [defaultPresetProfile()];
  } catch {
    return [defaultPresetProfile()];
  }
}

export async function profilesSave(profiles: Profile[]): Promise<void> {
  if (isDesktopMode()) {
    await callInvoke("profiles_save", { profiles });
    return;
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("loopautoma.profiles", JSON.stringify(profiles));
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

export async function startInputRecording(): Promise<void> {
  if (!isDesktopMode()) throw new Error("Input recording requires desktop mode. Please run the Tauri app to use this feature.");
  await callInvoke("start_input_recording");
}

export async function stopInputRecording(): Promise<void> {
  if (!isDesktopMode()) return; // best-effort no-op in web preview
  await callInvoke("stop_input_recording");
}
