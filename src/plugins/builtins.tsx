import { useState, useEffect } from "react";
import { ActionConfig, MouseButton } from "../types";
import { SPECIAL_KEYS, formatInlineKeyToken } from "../utils/specialKeys";
import { AcceleratingNumberInput } from "../components/AcceleratingNumberInput";
import { KeyboardReferenceOverlay } from "../components/KeyboardReferenceOverlay";
import { MouseIcon, KeyboardIcon, SparklesIcon } from "../components/Icons";
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
    <label
      title="How often the loop evaluates the trigger/condition (seconds)"
      style={{ display: "flex", alignItems: "center", gap: 6 }}
    >
      <span>Check interval (s)</span>
      <AcceleratingNumberInput
        min={0.1}
        value={value.check_interval_sec}
        onValueChange={(next) =>
          onChange({
            ...value,
            type: "IntervalTrigger",
            check_interval_sec: next === "" ? 0 : Number(next),
          })
        }
        inputMode="decimal"
        containerStyle={{ width: 170 }}
      />
    </label>
  );
}

// Condition: RegionCondition
function RegionConditionEditor({ value, onChange }: ConditionEditorProps) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <select
        value={value.expect_change ? "a" : "no"}
        onChange={(e) =>
          onChange({
            ...value,
            type: "RegionCondition",
            expect_change: e.target.value === "a",
          })
        }
        title="Trigger on change or no change"
        style={{ width: 80 }}
      >
        <option value="no">no</option>
        <option value="a">a</option>
      </select>
      <span>change detected for</span>
      <AcceleratingNumberInput
        min={1}
        value={value.consecutive_checks}
        onValueChange={(next) =>
          onChange({
            ...value,
            type: "RegionCondition",
            consecutive_checks: Math.max(1, next === "" ? 1 : Number(next)),
          })
        }
        containerStyle={{ width: 80 }}
        title="Number of consecutive checks with same state"
      />
      <span>check(s)</span>
    </div>
  );
}

// Actions: Click (x,y,button), Type
function ClickEditor({ value, onChange }: ActionEditorProps) {
  const v = value as Extract<ActionConfig, { type: "Click" }>;
  return (
    <>
      <MouseIcon size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
      <label title="Cursor X coordinate in screen pixels" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>X</span>
        <AcceleratingNumberInput
          value={v.x}
          onValueChange={(next) => onChange({ type: "Click", x: next === "" ? 0 : Number(next), y: v.y, button: v.button })}
          containerStyle={{ width: 110 }}
        />
      </label>
      <label title="Cursor Y coordinate in screen pixels" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>Y</span>
        <AcceleratingNumberInput
          value={v.y}
          onValueChange={(next) => onChange({ type: "Click", x: v.x, y: next === "" ? 0 : Number(next), button: v.button })}
          containerStyle={{ width: 110 }}
        />
      </label>
      <label title="Mouse button to click">
        Button
        <select
          value={v.button}
          onChange={(e) => onChange({ type: "Click", x: v.x, y: v.y, button: e.target.value as MouseButton })}
          style={{ marginLeft: 6 }}
        >
          <option value="Left">Left</option>
          <option value="Right">Right</option>
          <option value="Middle">Middle</option>
        </select>
      </label>
    </>
  );
}

function TypeEditor({ value, onChange }: ActionEditorProps) {
  const v = value as Extract<ActionConfig, { type: "Type" }>;
  const [pendingInsert, setPendingInsert] = useState("");
  const [showKeyRef, setShowKeyRef] = useState(false);
  const appendSpecialKey = (key: string) => {
    const token = formatInlineKeyToken(key);
    const prefix = v.text ?? "";
    const needsSpace = prefix.length > 0 && !prefix.endsWith(" ");
    const nextText = `${prefix}${needsSpace ? " " : ""}${token}`;
    onChange({ type: "Type", text: nextText });
  };
  return (
    <>
      <KeyboardIcon size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
      <div className="type-editor" title="Type literal text; use {Key:Enter} inline markers for special keys">
        <label>
          Text
          <textarea
            value={v.text}
            onChange={(e) => onChange({ type: "Type", text: e.target.value })}
            style={{ width: 260, minHeight: 48, marginLeft: 6 }}
          />
        </label>
        <div className="type-editor__helpers">
          <label>
            Insert special key
            <select
              value={pendingInsert}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                appendSpecialKey(next);
                setPendingInsert("");
              }}
            >
              <option value="">Choose…</option>
              {SPECIAL_KEYS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ghost"
            onClick={() => setShowKeyRef(true)}
            title="View all available keyboard tokens"
          >
            ⌨️ Key reference
          </button>
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, paddingTop: 4, borderTop: "1px solid #eee" }}>
          💡 Available variables: <code>$prompt</code> (from LLM action), <code>$risk</code> (risk level)
        </div>
      </div>
      {showKeyRef && <KeyboardReferenceOverlay onClose={() => setShowKeyRef(false)} />}
    </>
  );
}

function LLMPromptGenerationEditor({ value, onChange }: ActionEditorProps) {
  const v = value as Extract<ActionConfig, { type: "LLMPromptGeneration" }>;
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if running in Tauri environment
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import("../tauriSecureStorage").then(({ getOpenAIKeyStatus }) => {
        getOpenAIKeyStatus()
          .then((status) => setHasApiKey(status))
          .catch(() => setHasApiKey(false));
      });
    }
  }, []);

  return (
    <>
      <SparklesIcon size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, border: "1px solid #ccc", borderRadius: 4, flex: 1 }}>
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
          <label
            title="Maximum acceptable risk level (0.0 = low, 1.0 = high)"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span>Risk Threshold</span>
            <AcceleratingNumberInput
              min={0}
              max={1}
              value={v.risk_threshold}
              onValueChange={(next) =>
                onChange({ ...v, type: "LLMPromptGeneration", risk_threshold: next === "" ? 0 : Number(next) })
              }
              inputMode="decimal"
              containerStyle={{ width: 110 }}
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
        {hasApiKey === false && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              backgroundColor: "#fff3cd",
              color: "#856404",
              fontSize: 12,
              border: "1px solid #ffeaa7",
              marginBottom: 8,
            }}
            role="alert"
          >
            ⚠️ OpenAI API key not configured. <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent("open-settings"));
              }}
              style={{ color: "#856404", textDecoration: "underline", cursor: "pointer" }}
            >
              Open Settings
            </a> to add your key.
          </div>
        )}

        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, lineHeight: 1.5 }}>
          💡 <strong>How it works:</strong> Captures specified regions as screenshots → sends to OpenAI GPT-4 Vision → analyzes content → generates prompt based on risk threshold → stores result in ${'{'}${v.variable_name || "prompt"}{'}'} variable for use in subsequent Type actions.
        </div>

        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
          💡 <strong>Tip:</strong> Reference the variable in subsequent Type actions using {'$' + (v.variable_name || "prompt")}
        </div>
      </div>
    </>
  );
}

export function registerBuiltins() {
  registerTriggerEditor("IntervalTrigger", IntervalTriggerEditor);
  registerConditionEditor("RegionCondition", RegionConditionEditor);
  registerActionEditor("Click", ClickEditor);
  registerActionEditor("Type", TypeEditor);
  registerActionEditor("LLMPromptGeneration", LLMPromptGenerationEditor);
}
