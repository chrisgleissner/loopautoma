# Loop Automa — Lean Rollout Plan (Ubuntu/X11‑first MVP)

Global rule: Progress only when the current phase is complete, tests pass, and combined coverage (Rust + UI) is ≥90% for that phase. MVP scope: Ubuntu 24.04 in X11 sessions. macOS and Windows 11 come after the Ubuntu/X11 MVP, behind the same trait‑based backends described in doc/architecture.md.

Required reading: doc/architecture.md for contracts and OS abstraction; this file for acceptance gates. Prefer defaults from Tauri/React/Rust unless architecture requires otherwise.

## Phase 0 — Foundations (done)

- [x] Tauri 2 app with Rust backend + React/TypeScript UI scaffolded.
- [x] Tooling pinned: Rust stable ≥1.75; TypeScript 5.9; Bun ≥1.3.
- [x] Core contracts defined: Trigger, Condition, Action, ActionSequence, ScreenCapture, Automation, Monitor.
- [x] Shared model: Region, Event (incl. WatchdogTripped, MonitorStateChanged), Profile JSON schema.
- [x] Initial implementations: IntervalTrigger, RegionCondition, basic Actions, Monitor with guardrails; fakes for tests.
- [x] Tauri bridge: profiles_load/save, monitor_start/stop, optional region_pick; event delivery to UI over a Tauri event channel.
- [x] UI MVP: Profile editor, Monitor Start/Stop, live Event log, guardrail inputs, Panic Stop.
- [x] CI with coverage upload and gate at ≥90%.

## Phase 1 — Ubuntu/X11 Backends (MVP core)

Deliverables: working unattended app on Ubuntu/X11 with first‑class backend support and authoring helpers.

- [x] Backend traits finalized (domain): ScreenCapture, Automation (replay), InputCapture (recording). Unified types: InputEvent, MouseEvent, KeyboardEvent, ScreenFrame, DisplayInfo, BackendError.
- [x] X11 screen capture (xcap with PipeWire + SPA): multi-monitor, ARGB32 conversion, downscale + hash utilities (xxh3 via ahash).
- [x] X11 input capture (XInput2 + XKB): raw motion, buttons, wheel; key down/up with modifiers; background thread; reconnect logic.
- [x] X11 input replay (XTest): absolute pointer move, button up/down, key down/up; layout translation via XKB.
- [x] Tauri commands for authoring flows: region_picker_show/region_picker_complete, region_capture_thumbnail, start_input_recording/stop_input_recording, inject_mouse_event/inject_keyboard_event (throttled; dev-only by default).
- [x] UI authoring helpers: Region overlay for selection (drag-to-select), RegionAuthoringPanel with thumbnails, and a RecordingBar with timeline (start/stop).
- [x] Tests: 16 Rust unit/integration tests (Monitor, Trigger, Condition, Action, Guardrails, E2E, soak); 13 UI test files (components, hooks, integration); coverage measurement pending network access.
- [x] Packaging: Build configuration complete (tauri.conf.json); CI validates bundling; doc/install.md documents Ubuntu packages and X11 requirement.

### Phase 1 status — 2025-11-14 update

- [x] Domain now defines DisplayInfo, ScreenFrame, InputCapture, InputEvent, and BackendError across contracts.
- [x] Linux ScreenCapture uses `xcap` (PipeWire + SPA + clang) by default alongside native XI2 input capture and XTest automation for Ubuntu/X11 sessions.
- [x] Authoring Tauri commands (region picker, thumbnail capture, input recorder, input injection) fully implemented and wired to UI.
- [x] UI authoring helpers complete: Region overlay for selection, RegionAuthoringPanel with thumbnails, RecordingBar with live timeline.
- [x] Monitor runtime hardened: guardrail enforcement (cooldown, max_runtime, max_activations_per_hour), panic stop UX.
- [x] Comprehensive test suite: 16 Rust tests + 13 UI test files covering units, integration, edge cases, and E2E happy path.
- [x] Installation documentation created (doc/install.md) with Ubuntu package instructions, X11 requirements, troubleshooting.
- [ ] Outstanding: Coverage measurement (≥90%), Ubuntu bundling verification, CI validation (blocked by network access in current environment).

#### Status Summary
**Core implementation: COMPLETE**  
**Validation: PENDING** (requires network for cargo/bun dependencies)

See [doc/phase1Completion.md](phase1Completion.md) for detailed completion report.

Gate: all tasks done on Ubuntu/X11, tests green, coverage ≥90%, Ubuntu package produced.

**Current Status (2025-11-15)**: Core implementation complete and validation passes locally (tests, coverage, soak, hardware sample). Release builds now block dev-only input injection helpers; see `doc/securityReview.md`. CI will continue enforcing the ≥90% coverage gate.

## Phase 2 — Hardening on Ubuntu/X11

- [x] Performance pass: throttle authoring helpers; buffer reuse; enforce cooldowns/backoff; document CPU/memory baselines.
- [x] Soak test: long-running unattended loops validate guardrails and clean Panic Stop; memory/cpu bounds checked.
- [x] Security basics: input-synthesis safety, permissions review; dev-only flags locked down for production builds.
- [x] UX polish: clearer preset(s) like “Copilot Keep-Alive”; improved profile validation feedback.

Gate: tests green, coverage ≥90% for domain/runtime/UI; soak stability documented.

### Phase 2 status — 2025-11-15 update

- [x] Region authoring UI reuses buffers and suppresses duplicate renders; ProfileInsights panel surfaces guardrail/preset health inline.
- [x] Panic stop finalizer and soak/monitor regression tests extended to cover guardrail trips plus new throttle helpers.
- [x] Input injection commands require the explicit `LOOPAUTOMA_ALLOW_INJECT=1` env flag, keeping them dev-only.
- [x] Profile editor validates JSON via `auditProfile`, rendering actionable errors before persisting, and includes a one-click preset restore CTA.
- [x] Added `src-tauri/src/bin/soak_report.rs` plus `doc/perfBaseline.md` so we can regenerate soak JSON/CPU baselines on demand (fake backends today, hardware next).
- [x] Security review documented in `doc/securityReview.md`, with release-only guards that disable input injection in packaged builds and env flags for dev simulation.
- [x] Hardware metrics captured via `/usr/bin/time` + soak_report; artifacts stored under `coverage/perf/` and baselines documented in `doc/perfBaseline.md`.

## Phase 3 — Authoring Simplification & Evaluation Cadence

- [x] IntervalTrigger configuration refined as `check_interval_sec` (seconds, 0.1–86 400) across Rust domain, soak tooling, Tauri bridge, UI editors, tests, and docs, with a 60‑second default for the RegionCondition “no change in Regions” preset.
- [x] Screen preview/streaming helpers removed from the runtime, bridge, UI components, and tests so authoring relies solely on the region overlay, thumbnails, and RecordingBar.
- [x] Documentation (architecture, installation, rollout, completion reports) updated to describe periodic trigger evaluation without any live preview stream.

Gate: tests green (Rust + UI), soak runner reflects the new cadence, docs describe the simplified authoring workflow.

### Phase 3 status — 2025-11-15 update

- [x] Codebase now evaluates triggers strictly via `check_interval_sec`; all preview/streaming commands and tests have been removed.
- [x] Profiles, presets, audit tooling, and docs all use the seconds-based cadence with the 60 s default for the RegionCondition preset.
- [x] Authoring instructions emphasize overlay capture, thumbnails, and RecordingBar; no preview stream is exposed in the UI.

## Phase 4 — Cross‑OS Enablement (post‑MVP)

## Phase 4 — Cross‑OS Enablement (post‑MVP)

- [ ] macOS backends behind existing traits:
  - ScreenCapture implementation reachable via ScreenCapture trait and used by RegionCondition and thumbnails.
  - Automation implementation that supports MoveCursor, Click, Type, and Key actions.
  - InputCapture implementation that feeds InputEvent into the RecordingBar via start_input_recording/stop_input_recording.
  - Packaging/signing and basic smoke tests on supported macOS versions.
- [ ] Windows 11 backends behind existing traits:
  - ScreenCapture implementation reachable via ScreenCapture trait and used by RegionCondition and thumbnails.
  - Automation implementation that supports MoveCursor, Click, Type, and Key actions.
  - InputCapture implementation that feeds InputEvent into the RecordingBar via start_input_recording/stop_input_recording.
  - Packaging/signing and basic smoke tests on supported Windows 11 versions.
- [ ] Authoring parity across OSes:
  - Region overlay works consistently on Linux, macOS, and Windows for selection and highlighting of Regions.
  - Thumbnail capture and region highlighting provide enough visual feedback to validate Regions on each platform.
  - RecordingBar produces ActionSequence definitions with identical semantics on all platforms.
- [ ] Cross‑OS contract tests and documented limitations for ScreenCapture, Automation, InputCapture, RegionCondition, and ActionSequence.

Gate: smoke runs on each OS; domain/runtime coverage ≥90%; UI unchanged across OSes.


## Backlog / Future

- [ ] Focus‑binding Condition to restrict actions to an app/window.
- [ ] Optional keep‑awake Action (jiggle/sleep inhibition) behind traits.
- [ ] Extension registry and sample plug‑ins (DelayTrigger, NoopAction).
- [ ] OCR/LLM Conditions + Actions (not MVP).
- [ ] Telemetry opt‑in and privacy doc polish.
 
