// Shared model types mirroring Rust models (docs/architecture.md)
export type Rect = { x: number; y: number; width: number; height: number };
export type Region = { id: string; rect: Rect; name?: string };

export type TriggerConfig = { type: string; interval_ms: number };
export type ConditionConfig = { type: string; stable_ms: number; downscale: number };

export type MouseButton = "Left" | "Right" | "Middle";
export type ActionConfig =
  | { type: "MoveCursor"; x: number; y: number }
  | { type: "Click"; button: MouseButton }
  | { type: "Type"; text: string }
  | { type: "Key"; key: string };

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

export type MonitorState = "Stopped" | "Running" | "Stopping";

export type Event =
  | { type: "TriggerFired" }
  | { type: "ConditionEvaluated"; result: boolean }
  | { type: "ActionStarted"; action: string }
  | { type: "ActionCompleted"; action: string; success: boolean }
  | { type: "MonitorStateChanged"; state: MonitorState }
  | { type: "WatchdogTripped"; reason: string }
  | { type: "Error"; message: string };

export const defaultPresetProfile = (): Profile => ({
  id: "keep-agent-001",
  name: "Copilot Keep-Alive",
  regions: [
    { id: "chat-out", rect: { x: 80, y: 120, width: 1200, height: 600 }, name: "Agent Output" },
    { id: "progress", rect: { x: 80, y: 740, width: 1200, height: 200 }, name: "Progress Area" },
  ],
  trigger: { type: "IntervalTrigger", interval_ms: 750 },
  condition: { type: "RegionCondition", stable_ms: 8000, downscale: 4 },
  actions: [
    { type: "MoveCursor", x: 960, y: 980 },
    { type: "Click", button: "Left" },
    { type: "Type", text: "continue" },
    { type: "Key", key: "Enter" },
  ],
  guardrails: { max_runtime_ms: 3 * 60 * 60 * 1000, max_activations_per_hour: 120, cooldown_ms: 5000 },
});
