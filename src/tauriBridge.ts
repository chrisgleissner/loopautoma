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
