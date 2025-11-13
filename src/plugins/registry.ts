import { ActionConfig, ConditionConfig, Profile, TriggerConfig, Event } from "../types";
import { ComponentType } from "react";

// Editor contracts: every pluggable entity exposes a small editor component
export type TriggerEditorProps = {
  value: TriggerConfig;
  onChange: (next: TriggerConfig) => void;
};
export type ConditionEditorProps = {
  value: ConditionConfig;
  onChange: (next: ConditionConfig) => void;
  profile: Profile;
  onProfileChange: (p: Profile) => void;
};
export type ActionEditorProps = {
  value: ActionConfig;
  onChange: (next: ActionConfig) => void;
};

type Cmp<T> = ComponentType<T>;

const triggerEditors = new Map<string, Cmp<TriggerEditorProps>>();
const conditionEditors = new Map<string, Cmp<ConditionEditorProps>>();
const actionEditors = new Map<string, Cmp<ActionEditorProps>>();
const eventRenderers = new Map<string, ComponentType<{ event: Event }>>();

export function registerTriggerEditor(type: string, cmp: Cmp<TriggerEditorProps>) {
  triggerEditors.set(type, cmp);
}
export function registerConditionEditor(type: string, cmp: Cmp<ConditionEditorProps>) {
  conditionEditors.set(type, cmp);
}
export function registerActionEditor(type: string, cmp: Cmp<ActionEditorProps>) {
  actionEditors.set(type, cmp);
}

export function getTriggerTypes(): string[] {
  return Array.from(triggerEditors.keys());
}
export function getConditionTypes(): string[] {
  return Array.from(conditionEditors.keys());
}
export function getActionTypes(): string[] {
  return Array.from(actionEditors.keys());
}

export function getTriggerEditor(type: string) {
  return triggerEditors.get(type);
}
export function getConditionEditor(type: string) {
  return conditionEditors.get(type);
}
export function getActionEditor(type: string) {
  return actionEditors.get(type);
}

export function registerEventRenderer(eventType: Event["type"], cmp: ComponentType<{ event: Event }>) {
  eventRenderers.set(eventType, cmp);
}
export function getEventRenderer(type: Event["type"]) {
  return eventRenderers.get(type);
}
