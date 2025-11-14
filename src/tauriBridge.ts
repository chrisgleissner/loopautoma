import { invoke } from "@tauri-apps/api/core";
import { Profile } from "./types";

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

export async function regionPick(): Promise<{ x: number; y: number; width: number; height: number }> {
  const [x, y, width, height] = (await invoke("region_pick")) as [number, number, number, number];
  return { x, y, width, height };
}

export async function startScreenStream(fps?: number): Promise<void> {
  await invoke("start_screen_stream", { fps });
}

export async function stopScreenStream(): Promise<void> {
  await invoke("stop_screen_stream");
}

export async function startInputRecording(): Promise<void> {
  await invoke("start_input_recording");
}

export async function stopInputRecording(): Promise<void> {
  await invoke("stop_input_recording");
}
