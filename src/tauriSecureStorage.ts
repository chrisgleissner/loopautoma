// Tauri commands for secure API key and model management
import { invoke } from "@tauri-apps/api/core";

export async function getOpenAIKeyStatus(): Promise<boolean> {
    return await invoke<boolean>("get_openai_key_status");
}

export async function setOpenAIKey(key: string): Promise<void> {
    await invoke("set_openai_key", { key });
}

export async function deleteOpenAIKey(): Promise<void> {
    await invoke("delete_openai_key");
}

export async function getOpenAIModel(): Promise<string | null> {
    return await invoke<string | null>("get_openai_model");
}

export async function setOpenAIModel(model: string): Promise<void> {
    await invoke("set_openai_model", { model });
}
