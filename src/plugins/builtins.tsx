import { ActionConfig, MouseButton } from "../types";
import {
  ActionEditorProps,
  ConditionEditorProps,
  TriggerEditorProps,
  registerActionEditor,
  registerConditionEditor,
  registerTriggerEditor,
} from "./registry";

// Trigger: IntervalTrigger
function IntervalTriggerEditor({ value, onChange }: TriggerEditorProps) {
  return (
    <label title="How often the loop evaluates the trigger/condition (seconds)">
      Check interval (s)
      <input
        type="number"
        min="0.1"
        step="0.1"
        value={value.check_interval_sec}
        onChange={(e) =>
          onChange({
            ...value,
            type: "IntervalTrigger",
            check_interval_sec: Number(e.target.value || 0),
          })
        }
        style={{ width: 140, marginLeft: 6 }}
      />
    </label>
  );
}

// Condition: RegionCondition
function RegionConditionEditor({ value, onChange }: ConditionEditorProps) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <label title="Minimum time the regions must be unchanged">
        Stable (ms)
        <input
          type="number"
          value={value.stable_ms}
          onChange={(e) => onChange({ ...value, type: "RegionCondition", stable_ms: Number(e.target.value || 0) })}
          style={{ width: 120, marginLeft: 6 }}
        />
      </label>
      <label title="Downscale factor for hashing (higher = faster, lower precision)">
        Downscale
        <input
          type="number"
          value={value.downscale}
          onChange={(e) => onChange({ ...value, type: "RegionCondition", downscale: Number(e.target.value || 1) })}
          style={{ width: 80, marginLeft: 6 }}
        />
      </label>
    </div>
  );
}

// Actions: MoveCursor, Click, Type, Key
function MoveCursorEditor({ value, onChange }: ActionEditorProps) {
  const v = value as Extract<ActionConfig, { type: "MoveCursor" }>;
  return (
    <>
      <label title="Cursor X coordinate in screen pixels">
        X
        <input
          type="number"
          value={v.x}
          onChange={(e) => onChange({ type: "MoveCursor", x: Number(e.target.value || 0), y: v.y })}
          style={{ width: 80, marginLeft: 6 }}
        />
      </label>
      <label title="Cursor Y coordinate in screen pixels">
        Y
        <input
          type="number"
          value={v.y}
          onChange={(e) => onChange({ type: "MoveCursor", x: v.x, y: Number(e.target.value || 0) })}
          style={{ width: 80, marginLeft: 6 }}
        />
      </label>
    </>
  );
}

function ClickEditor({ value, onChange }: ActionEditorProps) {
  const v = value as Extract<ActionConfig, { type: "Click" }>;
  return (
    <label title="Mouse button to click">
      Button
      <select
        value={v.button}
        onChange={(e) => onChange({ type: "Click", button: e.target.value as MouseButton })}
        style={{ marginLeft: 6 }}
      >
        <option value="Left">Left</option>
        <option value="Right">Right</option>
        <option value="Middle">Middle</option>
      </select>
    </label>
  );
}

function TypeEditor({ value, onChange }: ActionEditorProps) {
  const v = value as Extract<ActionConfig, { type: "Type" }>;
  return (
    <label title="Text to type as keystrokes">
      Text
      <input
        type="text"
        value={v.text}
        onChange={(e) => onChange({ type: "Type", text: e.target.value })}
        style={{ width: 200, marginLeft: 6 }}
      />
    </label>
  );
}

function KeyEditor({ value, onChange }: ActionEditorProps) {
  const v = value as Extract<ActionConfig, { type: "Key" }>;
  return (
    <label title="Key to press (e.g., Enter)">
      Key
      <input
        type="text"
        value={v.key}
        onChange={(e) => onChange({ type: "Key", key: e.target.value })}
        style={{ width: 120, marginLeft: 6 }}
      />
    </label>
  );
}

function LLMPromptGenerationEditor({ value, onChange }: ActionEditorProps) {
  const v = value as Extract<ActionConfig, { type: "LLMPromptGeneration" }>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, border: "1px solid #ccc", borderRadius: 4 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label title="Region IDs to capture and send to LLM (comma-separated)">
          Region IDs
          <input
            type="text"
            value={v.region_ids.join(", ")}
            onChange={(e) =>
              onChange({
                ...v,
                type: "LLMPromptGeneration",
                region_ids: e.target.value.split(",").map((s) => s.trim()).filter((s) => s),
              })
            }
            placeholder="e.g., chat-out, progress"
            style={{ width: 200, marginLeft: 6 }}
          />
        </label>
        <label title="Maximum acceptable risk level (0.0 = low, 1.0 = high)">
          Risk Threshold
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={v.risk_threshold}
            onChange={(e) => onChange({ ...v, type: "LLMPromptGeneration", risk_threshold: Number(e.target.value || 0) })}
            style={{ width: 80, marginLeft: 6 }}
          />
        </label>
      </div>
      <label title="Optional system prompt to guide the LLM">
        System Prompt (optional)
        <textarea
          value={v.system_prompt || ""}
          onChange={(e) => onChange({ ...v, type: "LLMPromptGeneration", system_prompt: e.target.value || undefined })}
          placeholder="Optional: Guide the LLM with specific instructions..."
          style={{ width: "100%", minHeight: 60, marginTop: 4, fontFamily: "inherit" }}
        />
      </label>
      <label title="Variable name to store the generated prompt (default: prompt)">
        Variable Name
        <input
          type="text"
          value={v.variable_name || "prompt"}
          onChange={(e) => onChange({ ...v, type: "LLMPromptGeneration", variable_name: e.target.value || undefined })}
          placeholder="prompt"
          style={{ width: 150, marginLeft: 6 }}
        />
      </label>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
        💡 Tip: Reference the variable in subsequent Type actions using {'$' + (v.variable_name || "prompt")}
      </div>
    </div>
  );
}

export function registerBuiltins() {
  registerTriggerEditor("IntervalTrigger", IntervalTriggerEditor);
  registerConditionEditor("RegionCondition", RegionConditionEditor);
  registerActionEditor("MoveCursor", MoveCursorEditor);
  registerActionEditor("Click", ClickEditor);
  registerActionEditor("Type", TypeEditor);
  registerActionEditor("Key", KeyEditor);
  registerActionEditor("LLMPromptGeneration", LLMPromptGenerationEditor);
}
