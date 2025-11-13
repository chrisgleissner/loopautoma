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
    <label title="How often the loop ticks to evaluate the condition">
      Interval (ms)
      <input
        type="number"
        value={value.interval_ms}
        onChange={(e) => onChange({ ...value, type: "IntervalTrigger", interval_ms: Number(e.target.value || 0) })}
        style={{ width: 120, marginLeft: 6 }}
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

export function registerBuiltins() {
  registerTriggerEditor("IntervalTrigger", IntervalTriggerEditor);
  registerConditionEditor("RegionCondition", RegionConditionEditor);
  registerActionEditor("MoveCursor", MoveCursorEditor);
  registerActionEditor("Click", ClickEditor);
  registerActionEditor("Type", TypeEditor);
  registerActionEditor("Key", KeyEditor);
}
