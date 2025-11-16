import { useEffect, useMemo } from "react";
import { ActionConfig, Profile } from "../types";
import { containsInlineKeySyntax, splitInlineKeySyntax } from "../utils/specialKeys";
import {
  getActionEditor,
  getActionTypes,
  getConditionEditor,
  getConditionTypes,
  getTriggerEditor,
  getTriggerTypes,
} from "../plugins/registry";
import { PlusIcon, TrashIcon, ScissorsIcon } from "./Icons";

export function GraphComposer({ profile, onChange }: { profile: Profile | null; onChange: (p: Profile) => void }) {
  const triggerTypes = useMemo(() => getTriggerTypes(), []);
  const conditionTypes = useMemo(() => getConditionTypes(), []);
  const actionTypes = useMemo(() => getActionTypes(), []);

  useEffect(() => {
    // no-op; this component reflects given profile
  }, [profile]);

  if (!profile) return <div style={{ opacity: 0.7 }}>No profile selected</div>;

  const TrigEditor = getTriggerEditor(profile.trigger.type);
  const CondEditor = getConditionEditor(profile.condition.type);

  const splitInlineKeys = (index: number) => {
    if (!profile) return;
    const target = profile.actions[index];
    if (!target || target.type !== "Type") return;
    const expanded = splitInlineKeySyntax(target.text);
    const hasKey = expanded.some((action) => action.type === "Key");
    if (!hasKey) {
      return;
    }
    const next = [...profile.actions];
    next.splice(index, 1, ...expanded);
    onChange({ ...profile, actions: next });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong title="When the loop checks the condition">Trigger</strong>
        <select
          value={profile.trigger.type}
          onChange={(e) => onChange({ ...profile, trigger: { ...profile.trigger, type: e.target.value } })}
          title="Choose how often to tick (IntervalTrigger recommended for MVP)"
        >
          {triggerTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {TrigEditor && (
          <span>
            <TrigEditor value={profile.trigger} onChange={(next) => onChange({ ...profile, trigger: next })} />
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong title="What must be true before actions run">Condition</strong>
        <select
          value={profile.condition.type}
          onChange={(e) => onChange({ ...profile, condition: { ...profile.condition, type: e.target.value } })}
          title="RegionCondition detects no visual change for a duration"
        >
          {conditionTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {CondEditor && (
          <span>
            <CondEditor
              value={profile.condition}
              onChange={(next) => onChange({ ...profile, condition: next })}
              profile={profile}
              onProfileChange={onChange}
            />
          </span>
        )}
      </div>

      <div>
        <div className="action-sequence-header">
          <strong title="What to do once the condition is true">Action Sequence</strong>
          <div className="action-toolbar" role="group" aria-label="Action sequence controls">
            <button
              className="icon-button accent"
              onClick={() => {
                const t = actionTypes[0] ?? "Click";
                const def: ActionConfig = t === "MoveCursor"
                  ? { type: "MoveCursor", x: 0, y: 0 }
                  : t === "Type"
                    ? { type: "Type", text: "" }
                    : t === "Key"
                      ? { type: "Key", key: "Enter" }
                      : t === "LLMPromptGeneration"
                        ? { type: "LLMPromptGeneration", region_ids: [], risk_threshold: 0.5 }
                        : { type: "Click", button: "Left" };
                onChange({ ...profile, actions: [...profile.actions, def] });
              }}
              title="Append an action to the sequence"
              aria-label="Add action"
            >
              <PlusIcon size={18} />
              <span className="sr-only">Add action</span>
            </button>
            <button
              className="icon-button danger"
              onClick={() => onChange({ ...profile, actions: [] })}
              disabled={profile.actions.length === 0}
              title="Clear all actions"
              aria-label="Clear all actions"
            >
              <TrashIcon size={18} />
              <span className="sr-only">Clear all actions</span>
            </button>
          </div>
        </div>
        <ol className="action-sequence-list">
          {profile.actions.map((a, i) => {
            const Editor = getActionEditor(a.type);
            const showSplitInline = a.type === "Type" && containsInlineKeySyntax(a.text);
            return (
              <li key={i} className="action-row">
                <div className="action-row-controls">
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => {
                      const arr = profile.actions.slice();
                      arr.splice(i, 1);
                      onChange({ ...profile, actions: arr });
                    }}
                    title="Remove this action"
                    aria-label="Remove this action"
                  >
                    <TrashIcon size={16} />
                    <span className="sr-only">Remove action</span>
                  </button>
                  {showSplitInline && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => splitInlineKeys(i)}
                      title="Split inline special keys into discrete Type/Key actions"
                      aria-label="Split inline keys"
                    >
                      <ScissorsIcon size={16} />
                      <span className="sr-only">Split inline keys</span>
                    </button>
                  )}
                </div>
                <div className="action-row-editor">
                  <select
                    value={a.type}
                    onChange={(e) => {
                      const t = e.target.value;
                      const def: ActionConfig = t === "MoveCursor"
                        ? { type: "MoveCursor", x: 0, y: 0 }
                        : t === "Type"
                          ? { type: "Type", text: "" }
                          : t === "Key"
                            ? { type: "Key", key: "Enter" }
                            : t === "LLMPromptGeneration"
                              ? { type: "LLMPromptGeneration", region_ids: [], risk_threshold: 0.5 }
                              : { type: "Click", button: "Left" };
                      const next = [...profile.actions];
                      next[i] = def;
                      onChange({ ...profile, actions: next });
                    }}
                    title="Change the action type"
                  >
                    {actionTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {Editor && (
                    <span>
                      <Editor
                        value={a}
                        onChange={(next) => {
                          const arr = [...profile.actions];
                          arr[i] = next;
                          onChange({ ...profile, actions: arr });
                        }}
                      />
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
