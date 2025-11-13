# Loop Automa — Lean Rollout Plan (Ubuntu/X11‑first MVP)

Global rule: Progress only when the current phase is complete, tests pass, and combined coverage (Rust + UI) is ≥90% for that phase. MVP scope: Ubuntu 24.04 in X11 sessions. macOS and Windows 11 come after the Ubuntu/X11 MVP, behind the same trait‑based backends described in doc/architecture.md.

Required reading: doc/architecture.md for contracts and OS abstraction; this file for acceptance gates. Prefer defaults from Tauri/React/Rust unless architecture requires otherwise.

## Phase 0 — Foundations (done)

- [x] Tauri 2 app with Rust backend + React/TypeScript UI scaffolded.
- [x] Tooling pinned: Rust stable ≥1.75; TypeScript 5.9; Bun ≥1.3.
- [x] Core contracts defined: Trigger, Condition, Action, ActionSequence, ScreenCapture, Automation, Monitor.
- [x] Shared model: Region, Event (incl. WatchdogTripped, MonitorStateChanged), Profile JSON schema.
- [x] Initial implementations: IntervalTrigger, RegionCondition, basic Actions, Monitor with guardrails; fakes for tests.
- [x] Tauri bridge: profiles_load/save, monitor_start/stop, optional region_pick; event streaming to UI.
- [x] UI MVP: Profile editor, Monitor Start/Stop, live Event log, guardrail inputs, Panic Stop.
- [x] CI with coverage upload and gate at ≥90%.

## Phase 1 — Ubuntu/X11 Backends (MVP core)

Deliverables: working unattended app on Ubuntu/X11 with first‑class backend support and authoring helpers.

- [x] Backend traits finalized (domain): ScreenCapture, Automation (replay), InputCapture (recording). Unified types: InputEvent, MouseEvent, KeyboardEvent, ScreenFrame, DisplayInfo, BackendError.
- [ ] X11 screen capture (XShm + Xrandr; fallback XGetImage): multi‑monitor, ARGB32 conversion, downscale + hash utilities.
- [ ] X11 input capture (XInput2 + XKB): raw motion, buttons, wheel; key down/up with modifiers; background thread; reconnect logic.
- [ ] X11 input replay (XTest): absolute pointer move, button up/down, key down/up; layout translation via XKB.
- [x] Tauri commands for authoring flows: start_screen_stream/stop_screen_stream, start_input_recording/stop_input_recording, inject_mouse_event/inject_keyboard_event (throttled; dev-only by default).
- [ ] UI authoring helpers: region selection overlay, recording bar (start/stop), optional low‑FPS screen preview, simple event timeline.
- [ ] Tests: unit + integration around backends (where feasible), Monitor loop with fakes; UI component/contract tests; one end‑to‑end happy path.
- [ ] Packaging: Ubuntu bundle(s) produced; documented Wayland limitation (X11 required).

### Phase 1 status — 2025-11-13 snapshot

- [x] Domain now defines DisplayInfo, ScreenFrame, InputCapture, InputEvent, and BackendError across contracts.
- [x] Linux ScreenCapture uses `xcap` (PipeWire + SPA + clang) by default with feature-gated input and automation fakes (`device_query`, `enigo`) until XInput2/XTest ship.
- [x] Authoring Tauri commands (screen stream, input recorder, input injection) are scaffolded; UI wiring pending.
- [ ] Outstanding: native X11 input capture/replay implementations, UI authoring overlay/timeline, guardrail hardening, Ubuntu bundling, integration/E2E coverage at ≥90%.

#### Execution order (next steps)
1. Replace the interim `device_query`/`enigo` shims with real X11 backends (XI2 listener + XKB mapping for recording; XTest/xtst for replay) plus targeted integration tests.
2. Wire UI authoring helpers to the backend streams: start/stop commands, live screen preview, global input timeline, and a region picker overlay.
3. Harden the monitor runtime (guardrail enforcement, cooldown watchdog, panic stop UX) and add fakes/integration tests that exercise hash stability, rate limits, and panic recovery.
4. Package Ubuntu bundles via `bun run build`, document the installation (X11 requirement), and capture a smoke/regression checklist; keep overall coverage ≥90%.

Gate: all tasks done on Ubuntu/X11, tests green, coverage ≥90%, Ubuntu package produced.

## Phase 2 — Hardening on Ubuntu/X11

- [ ] Performance pass: throttle authoring streams; buffer reuse; enforce cooldowns/backoff; document CPU/memory baselines.
- [ ] Soak test: long‑running unattended loops validate guardrails and clean Panic Stop; memory/cpu bounds checked.
- [ ] Security basics: input‑synthesis safety, permissions review; dev‑only flags locked down for production builds.
- [ ] UX polish: clearer preset(s) like “Copilot Keep‑Alive”; improved profile validation feedback.

Gate: tests green, coverage ≥90% for domain/runtime/UI; soak stability documented.

## Phase 3 — Cross‑OS Enablement (post‑MVP)

- [ ] macOS backends behind existing traits: ScreenCapture (CGDisplayStream), Automation (Quartz events), InputCapture (event taps); packaging/signing; smoke.
- [ ] Windows 11 backends behind existing traits: ScreenCapture (Desktop Duplication), Automation (SendInput), InputCapture (Raw Input/hooks); packaging/signing; smoke.
- [ ] Cross‑OS contract tests and limitations documented.

Gate: smoke runs on each OS; domain/runtime coverage ≥90%; UI unchanged across OSes.

## Backlog / Future

- [ ] Focus‑binding Condition to restrict actions to an app/window.
- [ ] Optional keep‑awake Action (jiggle/sleep inhibition) behind traits.
- [ ] Extension registry and sample plug‑ins (DelayTrigger, NoopAction).
- [ ] OCR/LLM Conditions + Actions (not MVP).
- [ ] Telemetry opt‑in and privacy doc polish.

