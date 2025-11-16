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

Guardrail settings live with each profile:

- **cooldownMs** — enforced between successful action sequences
- **maxActivationsPerHour** — stops the monitor if exceeded
- **maxRuntimeMs** — shutdown timer for unattended safety

## 4. Profile selector & insights panel

- **Profile dropdown**: Choose any saved profile or click **“+ New profile”** to clone the currently selected one.
- **Preset badge**: Indicates whether the profile matches a built-in preset. Click **Restore preset** to revert.
- **Insights panel**: Shows guardrail warnings, missing regions, or invalid action sequences. Fix issues before starting the monitor.
- **Persistence**: Profiles auto-save. Editing name/description, guardrails, or actions writes immediately to disk.

## 5. Defining screen regions

1. Click **“Define watch region”** to open the translucent overlay.
2. Drag from the top-left of the desired area to the bottom-right. All four drag directions are supported.
3. Release to preview the rectangle. Use the inline form to rename the region.
4. Click **Save region** to add it to the profile. The Region Panel lists every region with a thumbnail and bounding box details.
5. Use **Refresh thumbnail** to capture the latest pixels or **Remove** to delete a region.

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

## 7. Graph Composer

- Provides a node-based view of the Trigger → Condition → Actions pipeline.
- Click a node to edit its configuration: interval (Trigger), stableMs/downscale/hash (Condition), or the ordered list of actions.
- Drag actions to reorder. Add new actions via the “+ Action” button (MoveCursor, Click, Type, Key, LLMPromptGeneration, etc.).
- Validation errors are displayed inline (missing coordinates, empty text, invalid region references).

## 8. JSON editor

- The JSON tab now shows the entire workspace config (`{"version": 1, "profiles": [...]}`) that the backend persists. It mirrors the schema from `doc/architecture.md`.
- Saving validates every profile in the array; invalid JSON or schema errors surface inline and block persistence until fixed.
- Use this editor for batch changes (renaming multiple regions, duplicating action sequences, or editing metadata across profiles) or for features not yet exposed in the visual UI.

## 9. Event Log and insights

- Streams every lifecycle event: `TriggerFired`, `ConditionEvaluated`, `ActionStarted/Completed`, `WatchdogTripped`, and error messages.
- Use the filter buttons to focus on guardrails or errors during debugging.
- Clicking an entry reveals structured payloads (region hashes, action IDs, guardrail reasons).

## 10. Quit workflow

- **Desktop build**: The Quit button closes the main window, stops the monitor/input capture, and exits the Tauri process. Use this after stopping automation.
- **Web preview**: Browsers block `window.close()` for tabs the app didn’t open. The Quit button logs instructions in the console; close the tab manually.
- Before quitting, stop the monitor or trigger Panic Stop to ensure no actions keep running.

## 11. Troubleshooting checklist

| Symptom | Fix |
| --- | --- |
| Monitor refuses to start | Check Insights panel for invalid regions/actions; ensure at least one region exists. |
| Guardrail immediately trips | Increase cooldown/max activations, or confirm the condition is not always true (e.g., region never changes). |
| Recording button disabled | Verify you’re running the desktop app with `LOOPAUTOMA_BACKEND` unset; fake backend disables OS hooks. |
| Screenshot/manual mismatch | Run `bun run build:web` to regenerate the screenshot using the deterministic automation. |
| Release build shows wrong version | Ensure the release tag follows `vMAJOR.MINOR.PATCH`; the workflow syncs manifests before packaging. |

## 12. Key commands summary

- `bun run dev` — web preview for rapid UI changes (fake backends only).
- `bun run tauri dev` — desktop development build (requires Ubuntu/X11 + dependencies).
- `bun run build:web` — production web build + automated screenshot regeneration (Playwright preview).
- `bun run generate:ui-screenshot` — standalone screenshot refresh without rebuilding.
- `bun scripts/updateVersionsFromTag.ts vX.Y.Z` — align manifest versions before cutting a tag.

For deeper architectural context, see `doc/architecture.md`. For build and dependency details, consult `doc/developer.md` and `doc/install.md`.
