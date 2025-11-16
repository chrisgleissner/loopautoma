// Shared model types mirroring Rust models (doc/architecture.md)
export type Rect = { x: number; y: number; width: number; height: number };
export type Region = { id: string; rect: Rect; name?: string };

export type TriggerConfig = { type: string; check_interval_sec: number };
export type ConditionConfig = { type: string; stable_ms: number; downscale: number };

export type MouseButton = "Left" | "Right" | "Middle";
export type Modifiers = { shift: boolean; control: boolean; alt: boolean; meta: boolean };
export type ActionConfig =
  | { type: "MoveCursor"; x: number; y: number }
  | { type: "Click"; button: MouseButton }
  | { type: "Type"; text: string }
  | { type: "Key"; key: string }
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
  | { type: "Error"; message: string };

export type MouseInputEvent = {
  event_type: "move" | { button_down: MouseButton } | { button_up: MouseButton } | Record<string, never>;
  x: number;
  y: number;
  modifiers: Modifiers;
  timestamp_ms: number;
};

export type KeyboardInputEvent = {
  state: "down" | "up";
  key: string;
  code: number;
  text?: string | null;
  modifiers: Modifiers;
  timestamp_ms: number;
};

export type ScrollInputEvent = {
  delta_x: number;
  delta_y: number;
  modifiers: Modifiers;
  timestamp_ms: number;
};

export type InputEvent =
  | { kind: "mouse"; mouse: MouseInputEvent }
  | { kind: "keyboard"; keyboard: KeyboardInputEvent }
  | { kind: "scroll"; scroll: ScrollInputEvent };

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
  id: "keep-agent-001",
  name: "Keep AI Agent Active",
  regions: [
    { id: "chat-out", rect: { x: 80, y: 120, width: 1200, height: 600 }, name: "Agent Output" },
    { id: "progress", rect: { x: 80, y: 740, width: 1200, height: 200 }, name: "Progress Area" },
  ],
  trigger: { type: "IntervalTrigger", check_interval_sec: 60 },
  condition: { type: "RegionCondition", stable_ms: 8000, downscale: 4 },
  actions: [
    { type: "MoveCursor", x: 960, y: 980 },
    { type: "Click", button: "Left" },
    { type: "Type", text: "continue" },
    { type: "Key", key: "Enter" },
  ],
  guardrails: { max_runtime_ms: 3 * 60 * 60 * 1000, max_activations_per_hour: 120, cooldown_ms: 5000 },
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
