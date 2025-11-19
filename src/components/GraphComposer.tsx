import { useEffect, useMemo } from "react";
import { ActionConfig, Profile } from "../types";
import {
  getActionEditor,
  getActionTypes,
  getConditionEditor,
  getTriggerEditor,
} from "../plugins/registry";
import { PlusIcon, TrashIcon } from "./Icons";
import { TerminationConditionsEditor } from "./TerminationConditionsEditor";

export function GraphComposer({ profile, onChange }: { profile: Profile | null; onChange: (p: Profile) => void }) {
  const actionTypes = useMemo(() => getActionTypes(), []);

  useEffect(() => {
    // no-op; this component reflects given profile
  }, [profile]);

  if (!profile) return <div style={{ opacity: 0.7 }}>No profile selected</div>;

  const TrigEditor = getTriggerEditor(profile.trigger.type);
  const CondEditor = getConditionEditor(profile.condition.type);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong title="How often to check regions">Check Every</strong>
        {TrigEditor && (
          <TrigEditor value={profile.trigger} onChange={(next) => onChange({ ...profile, trigger: next })} />
        )}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span>Trigger if</span>
        {CondEditor && (
          <CondEditor
            value={profile.condition}
            onChange={(next) => onChange({ ...profile, condition: next })}
            profile={profile}
            onProfileChange={onChange}
          />
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
                const def: ActionConfig = t === "Type"
                  ? { type: "Type", text: "" }
                  : t === "LLMPromptGeneration"
                    ? { type: "LLMPromptGeneration", region_ids: [], risk_threshold: 0.5 }
                    : { type: "Click", x: 0, y: 0, button: "Left" };
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
                </div>
                <div className="action-row-editor">
                  {Editor && (
                    <Editor
                      value={a}
                      onChange={(next) => {
                        const arr = [...profile.actions];
                        arr[i] = next;
                        onChange({ ...profile, actions: arr });
                      }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Termination Conditions Section */}
      <div>
        <TerminationConditionsEditor
          guardrails={profile.guardrails || { cooldown_ms: 5000 }}
          regions={profile.regions}
          onGuardrailsChange={(guardrails) => onChange({ ...profile, guardrails })}
        />
      </div>
    </div>
  );
}
