import { invoke } from "@tauri-apps/api/core";
import { Profile, Rect } from "./types";

export async function profilesLoad(): Promise<Profile[]> {
  return (await invoke("profiles_load")) as Profile[];
}

export async function profilesSave(profiles: Profile[]): Promise<void> {
  await invoke("profiles_save", { profiles });
}

export async function monitorStart(profileId: string): Promise<void> {
  await invoke("monitor_start", { profileId });
}

export async function monitorStop(): Promise<void> {
  await invoke("monitor_stop");
}

export async function monitorPanicStop(): Promise<void> {
  await invoke("monitor_panic_stop");
}

export async function windowPosition(): Promise<{ x: number; y: number }> {
  const [x, y] = (await invoke("window_position")) as [number, number];
  return { x, y };
}

export async function windowInfo(): Promise<{ x: number; y: number; scale: number }> {
  const [x, y, scale] = (await invoke("window_info")) as [number, number, number];
  return { x, y, scale };
}

export type RegionPickPoint = { x: number; y: number };

export async function regionPickerShow(): Promise<void> {
  await invoke("region_picker_show");
}

export async function regionPickerComplete(start: RegionPickPoint, end: RegionPickPoint): Promise<void> {
  await invoke("region_picker_complete", { submission: { start, end } });
}

export async function captureRegionThumbnail(rect: Rect): Promise<string | null> {
  return (await invoke("region_capture_thumbnail", { rect })) as string | null;
}

export async function startInputRecording(): Promise<void> {
  await invoke("start_input_recording");
}

export async function stopInputRecording(): Promise<void> {
  await invoke("stop_input_recording");
}
