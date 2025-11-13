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

export async function windowPosition(): Promise<{ x: number; y: number }> {
  const [x, y] = (await invoke("window_position")) as [number, number];
  return { x, y };
}

export async function regionPick(): Promise<{ x: number; y: number; width: number; height: number }> {
  const [x, y, width, height] = (await invoke("region_pick")) as [number, number, number, number];
  return { x, y, width, height };
}
