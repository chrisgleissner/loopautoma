// Shared model types mirroring Rust models (doc/architecture.md)
export type Rect = { x: number; y: number; width: number; height: number };
export type Region = { id: string; rect: Rect; name?: string };

export type TriggerConfig = { type: string; check_interval_sec: number };
export type ConditionConfig = { type: string; stable_ms: number; downscale: number };

export type MouseButton = "Left" | "Right" | "Middle";
export type ActionConfig =
  | { type: "Click"; x: number; y: number; button: MouseButton }
  | { type: "Type"; text: string }
  | {
    type: "LLMPromptGeneration";
    region_ids: string[];
    risk_threshold: number;
    system_prompt?: string;
    variable_name?: string;
  };

export type GuardrailsConfig = {
  max_runtime_ms?: number;
  max_activations_per_hour?: number;
  cooldown_ms: number;
};

export type Profile = {
  id: string;
  name: string;
  regions: Region[];
  trigger: TriggerConfig;
  condition: ConditionConfig;
  actions: ActionConfig[];
  guardrails?: GuardrailsConfig;
};

export type ProfilesConfig = {
  version?: number;
  profiles: Profile[];
};

export type MonitorState = "Stopped" | "Running" | "Stopping";

export type Event =
  | { type: "TriggerFired" }
  | { type: "ConditionEvaluated"; result: boolean }
  | { type: "ActionStarted"; action: string }
  | { type: "ActionCompleted"; action: string; success: boolean }
  | { type: "MonitorStateChanged"; state: MonitorState }
  | { type: "WatchdogTripped"; reason: string }
  | { type: "Error"; message: string }
  | { type: "MonitorTick"; next_check_ms: number; cooldown_remaining_ms: number; condition_met: boolean };

export type DisplayInfo = {
  id: number;
  name?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
};

export type ScreenFrame = {
  display: DisplayInfo;
  width: number;
  height: number;
  stride: number;
  bytes: number[];
  timestamp_ms: number;
};

export const defaultPresetProfile = (): Profile => ({
  id: "profile-" + Date.now().toString(36),
  name: "New Profile",
  regions: [],
  trigger: { type: "IntervalTrigger", check_interval_sec: 5 },
  condition: { type: "RegionCondition", stable_ms: 5000, downscale: 4 },
  actions: [],
  guardrails: { cooldown_ms: 5000 },
});

export const defaultProfilesConfig = (): ProfilesConfig => ({
  version: 1,
  profiles: [defaultPresetProfile()],
});

export const normalizeProfilesConfig = (input?: unknown): ProfilesConfig => {
  if (input && Array.isArray((input as any).profiles)) {
    const cfg = input as ProfilesConfig;
    const version = typeof cfg.version === "number" ? cfg.version : 1;
    const profiles = cfg.profiles?.length ? cfg.profiles : [defaultPresetProfile()];
    return { version, profiles: [...profiles] };
  }
  if (Array.isArray(input)) {
    const profiles = input.length ? (input as Profile[]) : [defaultPresetProfile()];
    return { version: 1, profiles: [...profiles] };
  }
  return defaultProfilesConfig();
};
