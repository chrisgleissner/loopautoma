import { useEffect, useMemo } from "react";
import { ActionConfig, Profile } from "../types";
import {
  getActionEditor,
  getActionTypes,
  getConditionEditor,
  getConditionTypes,
  getTriggerEditor,
  getTriggerTypes,
} from "../plugins/registry";

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <strong title="What to do once the condition is true">Action Sequence</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                const t = actionTypes[0] ?? "Click";
                const def: ActionConfig = t === "MoveCursor"
                  ? { type: "MoveCursor", x: 0, y: 0 }
                  : t === "Type"
                  ? { type: "Type", text: "" }
                  : t === "Key"
                  ? { type: "Key", key: "Enter" }
                  : { type: "Click", button: "Left" };
                onChange({ ...profile, actions: [...profile.actions, def] });
              }}
              title="Append an action to the sequence"
            >
              + Add Action
            </button>
            <button
              onClick={() => onChange({ ...profile, actions: [] })}
              disabled={profile.actions.length === 0}
              title="Remove all actions"
            >
              Clear All
            </button>
          </div>
        </div>
        <ol style={{ margin: 0, paddingLeft: 16 }}>
          {profile.actions.map((a, i) => {
            const Editor = getActionEditor(a.type);
            return (
              <li key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
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
                <button
                  onClick={() => {
                    const arr = profile.actions.slice();
                    arr.splice(i, 1);
                    onChange({ ...profile, actions: arr });
                  }}
                  title="Remove this action"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
