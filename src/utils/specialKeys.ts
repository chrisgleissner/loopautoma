import { ActionConfig } from "../types";

export type SpecialKeyOption = {
  value: string;
  label: string;
  hint?: string;
};

export const SPECIAL_KEYS: SpecialKeyOption[] = [
  { value: "Enter", label: "Enter ↵" },
  { value: "Escape", label: "Escape ⎋" },
  { value: "Tab", label: "Tab ⇥" },
  { value: "Backspace", label: "Backspace" },
  { value: "Delete", label: "Delete" },
  { value: "ArrowUp", label: "Arrow ↑" },
  { value: "ArrowDown", label: "Arrow ↓" },
  { value: "ArrowLeft", label: "Arrow ←" },
  { value: "ArrowRight", label: "Arrow →" },
  { value: "Home", label: "Home" },
  { value: "End", label: "End" },
  { value: "PageUp", label: "Page Up" },
  { value: "PageDown", label: "Page Down" },
  { value: "Space", label: "Space" },
  { value: "F1", label: "F1" },
  { value: "F2", label: "F2" },
  { value: "F3", label: "F3" },
  { value: "F4", label: "F4" },
  { value: "F5", label: "F5" },
  { value: "F6", label: "F6" },
  { value: "F7", label: "F7" },
  { value: "F8", label: "F8" },
  { value: "F9", label: "F9" },
  { value: "F10", label: "F10" },
  { value: "F11", label: "F11" },
  { value: "F12", label: "F12" },
];

export function normalizeSpecialKey(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const match = SPECIAL_KEYS.find((opt) => opt.value.toLowerCase() === trimmed.toLowerCase());
  return match ? match.value : trimmed;
}

const INLINE_REGEX = /\{\s*Key\s*:\s*([^}]+)\s*}/gi;

export function containsInlineKeySyntax(text?: string | null): boolean {
  if (!text) return false;
  INLINE_REGEX.lastIndex = 0;
  return INLINE_REGEX.test(text);
}

export function formatInlineKeyToken(key: string): string {
  return `{Key:${normalizeSpecialKey(key)}}`;
}

/**
 * Parses inline special key syntax (e.g., "Hello {Key:Enter}") into a list of Type/Key actions.
 * A plain Type action is returned unchanged if no inline markers are present.
 */
export function splitInlineKeySyntax(text: string): ActionConfig[] {
  if (!text) {
    return [{ type: "Type", text: "" }];
  }
  let lastIndex = 0;
  const actions: ActionConfig[] = [];
  const normalizedText = text;
  let match: RegExpExecArray | null;
  INLINE_REGEX.lastIndex = 0;
  while ((match = INLINE_REGEX.exec(normalizedText)) !== null) {
    const [token, rawKey] = match;
    const preceding = normalizedText.slice(lastIndex, match.index);
    if (preceding.length) {
      actions.push({ type: "Type", text: preceding });
    }
    const keyValue = normalizeSpecialKey(rawKey);
    actions.push({ type: "Key", key: keyValue });
    lastIndex = match.index + token.length;
  }
  const tail = normalizedText.slice(lastIndex);
  if (tail.length || actions.length === 0) {
    actions.push({ type: "Type", text: tail });
  }
  return actions.filter((action) => {
    if (action.type === "Type") {
      return action.text.length > 0;
    }
    return true;
  });
}
