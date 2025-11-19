# LoopAutoma User Manual

Last updated: 2025-11-16

![LoopAutoma UI](./img/ui-screenshot.png)

This guide walks through every major area of the LoopAutoma interface so you can keep unattended automations safe, observable, and easy to author. It assumes you have already installed the desktop app (see `doc/install.md`) or are running the web preview via `bun run dev` for dry runs.

## 1. Quick orientation

The main window is organized left‑to‑right:

1. **Monitor Control Bar** (top) — Start/Stop buttons, status chip, preset selector, guardrail summary, and panic stop.
2. **Profile Selector & Insights** (left column) — Choose presets, duplicate/delete profiles, and see guardrail health.
3. **Region Panel & Screen Preview** (center) — Define watch regions, view thumbnails, and access the region overlay.
4. **Recording Bar** (bottom) — Capture keyboard/mouse input to generate action sequences.
5. **Graph Composer & JSON Editor** (right column) — Visual and raw editors for triggers, conditions, and actions.
6. **Event Log** (bottom-right) — Stream of monitor events, guardrail trips, and errors.

## 2. Getting started with the preset

1. Launch the app (`bun run dev` for web mode or the packaged desktop build).
2. The **“Keep AI Agent Active”** preset loads automatically. It defines two default regions and a safe action sequence (`type "continue"` + Enter).
3. Review guardrails in the Guardrails drawer (max runtime 3h, cooldown 5s, max 120 activations/hour). Adjust as needed before starting.
4. Press **Start** to run against fake backends (web mode) or real backends (desktop build on Ubuntu/X11). The Event Log will show Trigger/Condition/Action events.

## 3. Monitor control, guardrails, and panic stop

- **Start / Stop**: Start spins up the Monitor with the currently selected profile. Stop gracefully ends the current loop after any in-flight action completes.
- **Status chip**: Shows `Stopped`, `Starting`, `Running`, `Stopping`, or guardrail alerts.
- **Guardrail summary**: Hover to see cooldown, max runtime, and activation limits. Click the pencil icon to edit.
- **Panic Stop**: Immediately terminates the monitor and resets guardrail counters. Use this if the automation misbehaves — it is idempotent and always available.

Guardrail settings live with each profile. The UI now edits these values in **seconds**, while the underlying profile JSON still stores milliseconds (`cooldown_ms`, `max_runtime_ms`).

- **Cooldown (seconds)** — enforced between successful action sequences
- **Max activations per hour** — stops the monitor if exceeded
- **Max runtime (seconds)** — shutdown timer for unattended safety

## 4. Profile selector & insights panel

- **Profile dropdown**: Choose any saved profile or click **“+ New profile”** to clone the currently selected one.
- **Preset badge**: Indicates whether the profile matches a built-in preset. Click **Restore preset** to revert.
- **Insights panel**: Shows guardrail warnings, missing regions, or invalid action sequences. Fix issues before starting the monitor.
- **Persistence**: Profiles auto-save. Editing name/description, guardrails, or actions writes immediately to disk.

## 5. Defining screen regions

1. Click the mouse icon (tooltip **“Define watch region”**) to open the translucent overlay.
2. Drag from the top-left of the desired area to the bottom-right. All four drag directions are supported.
3. Release to preview the rectangle. Use the inline form to rename the region.
4. Click **Save region** to add it to the profile. The Region Panel lists every region with a thumbnail and bounding box details.
5. Use the circular arrow icon (tooltip **“Refresh thumbnail”**) to capture the latest pixels or the trash icon to delete a region.

Tips:

- The overlay hides the main window during capture. Press **Esc** to cancel.
- Use multiple regions to watch separate UI sections (output pane vs. progress indicators).
- Regions feed both the Condition (stability detection) and LLM prompt actions.

## 6. Recording Bar and action sequences

1. Click **Record input** to start capturing global keyboard/mouse events.
2. Perform the gestures you want LoopAutoma to replay (mouse moves, clicks, text, hotkeys).
3. The timeline shows the latest 20 events, grouped by type. Use **Clear** to reset the visualization without losing buffered events.
4. Click **Stop recording** to finalize; buffered text is flushed into a single `Type` action.
5. Select **Save as actions** to convert the timeline into an ordered ActionSequence. The resulting actions appear in the Profile Editor and Graph Composer.

Notes:

- Recording requires real OS hooks. In web-only mode, the UI surfaces mock errors explaining that recording needs the desktop build.
- Modifier combos (Ctrl/Alt/Shift) and scroll events are captured. Scrolls appear in the timeline but are not persisted as actions in the current release.

### 6.1 Special-key shortcuts and inline syntax

- When editing an action sequence in the Graph Composer, use the **Insert special key** dropdown inside any **Type** action to append `{Key:…}` markers without memorizing the syntax.
- Supported keys include navigation (Arrows, Home/End), function keys, Enter/Escape, and you can still provide custom strings.
- Click the scissors icon (tooltip **“Split inline keys”**) to automatically convert a string like `"ping {Key:Enter}"` into two actions: `Type("ping ")` followed by `Key("Enter")`.
- The **Key** action editor now exposes the same preset list plus a dedicated custom field, so picking or editing keys is always a single click.
- Full syntax reference lives in this section and via the in-app helper link.

## 7. Graph Composer

- Provides a node-based view of the Trigger → Condition → Actions pipeline.
- Click a node to edit its configuration: interval (Trigger), stable duration in seconds + downscale/hash (Condition), or the ordered list of actions.
- Drag actions to reorder. Use the plus icon in the Action toolbar to add new steps (MoveCursor, Click, Type, Key, LLMPromptGeneration, etc.).
- Validation errors are displayed inline (missing coordinates, empty text, invalid region references).

## 8. JSON editor

- The JSON tab now shows the entire workspace config (`{"version": 1, "profiles": [...]}`) that the backend persists. It mirrors the schema from `doc/architecture.md`.
- Click **Save Config** to validate every profile in the array; invalid JSON or schema errors surface inline and block persistence until fixed.
- Use this editor for batch changes (renaming multiple regions, duplicating action sequences, or editing metadata across profiles) or for features not yet exposed in the visual UI.

## 9. Event Log and insights

- Streams every lifecycle event: `TriggerFired`, `ConditionEvaluated`, `ActionStarted/Completed`, `WatchdogTripped`, and error messages.
- Use the filter buttons to focus on guardrails or errors during debugging.
- Clicking an entry reveals structured payloads (region hashes, action IDs, guardrail reasons).

## 10. Settings panel (API keys, model selection, theme)

Click the **gear icon** (tooltip **"Settings"**) in the top-right corner to open the Settings panel. This dialog manages:

- **OpenAI API Key**: Securely stored in your OS keyring (macOS Keychain, Windows Credential Manager, or Linux Secret Service)
  - If no key is configured, you'll see an input field. Paste your key (starts with `sk-`) and click **Save Key**.
  - Once saved, the status shows **"✓ API key is configured"** with masked value `sk-••••••••••••••••`.
  - To replace the key, enter a new one and click **Replace Key**.
  - To remove the key, click **Delete Key**.
  - All keys are encrypted at rest by the OS; see `doc/secureStorage.md` for security details.

- **Model Selection**: Choose the OpenAI model used for `LLMPromptGeneration` actions
  - **GPT-4o**: Best for complex prompts requiring vision + reasoning (default)
  - **GPT-4o mini**: Faster and cheaper, suitable for simple prompt generation tasks
  - Model choice is saved to the workspace config and applies globally to all profiles.

- **Font Size Adjustment**: Increase or decrease the base font size for the entire UI (in 2px increments)

- **Theme Selector**: Future feature placeholder (light/dark/auto modes)

The Settings panel closes when you click outside the dialog or press **Esc**. Changes are persisted immediately (no separate save button required).

For platform-specific troubleshooting (e.g., keyring not available on Linux), see `doc/secureStorage.md`.

## 11. Quit workflow

- **Desktop build**: The Quit button closes the main window, stops the monitor/input capture, and exits the Tauri process. Use this after stopping automation.
- **Web preview**: Browsers block `window.close()` for tabs the app didn't open. The Quit button logs instructions in the console; close the tab manually.
- Before quitting, stop the monitor or trigger Panic Stop to ensure no actions keep running.

## 12. Troubleshooting checklist

| Symptom | Fix |
| --- | --- |
| Monitor refuses to start | Check Insights panel for invalid regions/actions; ensure at least one region exists. |
| Guardrail immediately trips | Increase cooldown/max activations, or confirm the condition is not always true (e.g., region never changes). |
| Recording button disabled | Verify you’re running the desktop app with `LOOPAUTOMA_BACKEND` unset; fake backend disables OS hooks. |
| Screenshot/manual mismatch | Run `bun run build:web` to regenerate the screenshot using the deterministic automation. |
| Release build shows wrong version | Ensure the release tag follows `vMAJOR.MINOR.PATCH`; the workflow syncs manifests before packaging. |

## 13. Key commands summary

- `bun run dev` — web preview for rapid UI changes (fake backends only).
- `bun run tauri dev` — desktop development build (requires Ubuntu/X11 + dependencies).
- `bun run build:web` — production web build + automated screenshot regeneration (Playwright preview).
- `bun run generate:ui-screenshot` — standalone screenshot refresh without rebuilding.
- `bun scripts/updateVersionsFromTag.ts vX.Y.Z` — align manifest versions before cutting a tag.

For deeper architectural context, see `doc/architecture.md`. For build and dependency details, consult `doc/developer.md` and `doc/install.md`.
