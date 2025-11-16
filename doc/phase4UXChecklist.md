# Phase 4 UX Checklist

This document outlines the expected UX flows for LoopAutoma in web-only dev mode (`bun run dev`). Use this as acceptance criteria before marking Phase 4 complete.

## Onboarding Flow

**Goal**: New user understands basic concepts and can create first profile

- [ ] Landing state shows ProfileSelector with "Keep AI Agent Active" preset
- [ ] Clicking preset profile loads it and shows ProfileInsights summary
- [ ] ProfileInsights displays: region count, action count, guardrails summary, trigger interval
- [ ] Start button becomes enabled after profile selection
- [ ] Quit button visible and functional (logs message in web-only mode, calls appQuit in Tauri mode)

## Profile Authoring Flow

**Goal**: User can define regions, record actions, configure triggers/conditions/guardrails

### Region Authoring
- [ ] "Define watch region" button visible in RegionAuthoringPanel
- [ ] Button disabled when no profile selected (with appropriate disabled state styling)
- [ ] Clicking button launches region picker (overlay or returns error in web-only without Tauri)
- [ ] RegionAuthoringPanel displays existing regions with thumbnails
- [ ] Each region card shows: thumbnail (or placeholder), friendly name, ID, rect coords, Refresh + Remove buttons
- [ ] Refresh thumbnail button works (calls captureRegionThumbnail, shows loading state)
- [ ] Remove button deletes region from profile and calls profilesSave

### Action Authoring (Recording)
- [ ] RecordingBar visible with "Record actions" button
- [ ] Clicking Record starts input recording (or shows error in fake backend mode)
- [ ] Recording status changes: "Record actions" → "Stop recording" with red indicator
- [ ] Timeline shows captured events in real-time (mouse clicks, keyboard presses, scroll)
- [ ] Stop button ends recording session
- [ ] "Save as ActionSequence" button becomes enabled after stop
- [ ] Clicking Save calls onSave callback with converted actions
- [ ] Clear button resets timeline

### Trigger/Condition Configuration
- [ ] GraphComposer displays trigger type selector (IntervalTrigger only in MVP)
- [ ] Check interval slider adjusts from 1-60s
- [ ] Condition type selector shows RegionCondition
- [ ] Stable duration input accepts milliseconds (default 1000ms)
- [ ] Downscale factor slider adjusts 1-8x

### Guardrails Configuration
- [ ] Guardrails section shows: Cooldown, Max runtime, Max activations/hour
- [ ] Each field updates profile immediately on change
- [ ] Invalid values (negative cooldown) rejected inline with error message
- [ ] ProfileEditor blocks save when auditProfile reports errors

## Runtime/Monitoring Flow

**Goal**: User starts monitor, sees events, can pause/stop/panic

- [ ] Start button triggers monitorStart command
- [ ] Monitor state transitions: Idle → Running
- [ ] Stop button becomes available after start
- [ ] EventLog displays events in chronological order as they arrive
- [ ] Event types visible: MonitorStarted, TriggerFired, ConditionEvaluated, ActivationStarted, ActionExecuted, ActivationComplete, GuardrailTrip, MonitorStopped
- [ ] Panic Stop button visible (red) and immediately stops monitor + emits Watchdog event
- [ ] Monitor respects guardrails: cooldown prevents immediate reactivation, max_runtime stops long-running sequences
- [ ] Scroll behavior: EventLog auto-scrolls to latest event

## Error Handling

**Goal**: User understands what went wrong and can recover

- [ ] Region picker error (in fake backend): clear message displayed in RegionAuthoringPanel
- [ ] Input recording error (LOOPAUTOMA_BACKEND=fake): error alert with guidance to remove env var
- [ ] Thumbnail capture failure: console warning, placeholder shown
- [ ] Profile validation errors: inline messages in ProfileEditor with specific issue (e.g., "Cooldown must be ≥ 0 ms")
- [ ] Monitor start failure: error message displayed, Start button re-enabled

## Persistence

**Goal**: User's work is saved and persists across sessions

- [ ] Creating default profile calls profilesSave immediately
- [ ] Editing guardrails triggers profilesSave
- [ ] Adding/removing regions triggers profilesSave
- [ ] Profile round-trip: load → modify → save → reload → verify changes reflected

## Web-Only Mode Limitations

These behaviors are expected in `bun run dev` mode without Tauri:

- [ ] Quit button logs "Quit requested in web dev mode; close the tab/window manually." instead of closing window
- [ ] Region picker may not function (requires Tauri overlay window)
- [ ] Input recording disabled (LOOPAUTOMA_BACKEND=fake prevents OS-level hooks)
- [ ] Monitor can run with fake ScreenCapture (deterministic hash sequences for testing)

## Acceptance Gate

All checklist items must be **verified via tests** or **manual testing** before marking Phase 4 complete.

**Test Coverage**: ≥90% combined (UI + Rust), all tests passing.
