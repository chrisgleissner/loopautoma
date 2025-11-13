# Loop Automa — Target Architecture Overview

This document defines the target architecture for a cross‑platform desktop app built with Tauri 2, a Rust backend, and a React/TypeScript UI. It uses the following abstract entities everywhere (no OS logic in the UI): Trigger, Condition, Action, ActionSequence, Monitor, Event, Region/RegionSource. The initial primary use case is unattended operation to keep an AI agent (e.g., VS Code Copilot) progressing indefinitely once started.

MVP target platform (scope): Ubuntu 24.04 on X11. The architecture preserves clean extension points for macOS and Windows 11, which will be implemented after the Ubuntu/X11 MVP phases are complete. Wayland is out‑of‑scope for the MVP.

## Tooling and versions (MVP)

- Rust stable (edition 2021) ≥1.75 (latest as of Nov 2025 is 1.91.x)
- UI runtime/build: Bun ≥1.3 (preferred). If blocked by compatibility, fall back to Node.js 20 LTS.
- Tauri 2 (stable; latest tag series ~2.9.x)
- TypeScript 5.x (latest stable is 5.9)
- Testing: Rust (cargo test + tarpaulin), UI (Vitest + React Testing Library) or `bun test`, E2E (Playwright)

Project bootstrap (idiomatic):

- Create the app using Tauri v2’s Bun scaffolding:
  - bun create tauri-app
- Choose the React + TypeScript template. Keep the generated structure; add crates/packages only when necessary.
- Favor idiomatic Tauri/Rust/React patterns; avoid overengineering. Keep abstractions only where required by the contracts in this document.

## Goals and constraints

- Cross‑platform desktop (macOS, Windows, Linux) with a single codebase.
- Rust backend with OS‑specific details hidden behind traits; React/TypeScript UI via Tauri commands.
- Persistence as JSON profiles; efficient screen hashing with minimal CPU load.
- Extensible: adding new Triggers/Conditions/Actions must not require redesign.
- Test‑driven: overall coverage ≥90% (Rust + UI combined) with unit + integration + E2E. CI uploads coverage to Codecov.
- Unattended operation: runs safely without a user present, with strong guardrails (watchdog, rate limits, bounded scope) and a single‑click “panic stop”.
 - MVP scope explicitly targets Ubuntu/X11; other OSes must be supportable by adding backends behind the same traits without modifying UI or core contracts.

## Layered architecture (modules and data flow)

Top to bottom layers; arrows indicate primary call/flow direction.

1) Desktop shell (Tauri App)
   - React/TypeScript Web UI (no OS branching)
   - Tauri commands/events bridge
   ↓
2) Adapter layer (tauri-bridge)
   - Exposes Rust commands to UI (start/stop Monitor, create/update Profiles, Region selection, etc.)
   - Forwards Events to UI via Tauri event stream
   ↓
3) Application layer (runtime)
  - Monitor: orchestrates Trigger → Condition evaluation → ActionSequence execution → Event emission
  - Profile Manager (JSON load/save/validate; schema versioning)
  - Event Bus (typed, async channel)
  - Watchdog and Guardrails: max runtime/activations, cooldowns, panic stop, and rate limiting applied around Monitor
  - Registry: maps JSON `type` descriptors to concrete Trigger/Condition/Action implementations
   ↓
4) Domain layer (core)
   - Abstract traits and types: Trigger, Condition, Action, ActionSequence, Event, Region, RegionSource, ScreenCapture, Automation
   - InputCapture trait for recording global keyboard/mouse events (for region picking, recording, and replay authoring)
   - Decision logic and contracts, pure and testable
   ↓
5) Platform layer (os-impl)
   - Concrete implementations behind traits:
     - ScreenCapture (RegionSource): fast downscaled capture + hashing
     - Automation: cursor move, click, type, key press (input replay)
     - InputCapture: global keyboard/mouse recording
   - Separate modules per OS; compiled conditionally; never surfaced to UI

Event flow (runtime):
Trigger fires → Event(trigger_fired) → Condition evaluates Regions (via ScreenCapture/RegionSource) → Event(condition_evaluated) → if true, execute ActionSequence via Automation → Event(action_executed) → all Events streamed to UI.

Recording/authoring flow (MVP helpers):
- Optional screen stream (for region picking/preview) and input recorder feed UI with ScreenFrame and InputEvent messages; these are not required for unattended operation but support profile authoring.

## Core abstractions (Rust traits)

Interfaces are intentionally minimal; implementations can extend via associated types/feature flags as needed.

- Trigger
  - Purpose: determines when/how a Condition is evaluated.
  - Contract: async tick() produces a signal; e.g., IntervalTrigger with user‑defined cadence.
- Condition
  - Purpose: abstract predicate on environment/system state.
  - MVP: RegionCondition detects no visual change in multiple Regions for a configured duration (stableMs).
- Action
  - Purpose: a single executable unit manipulating environment state.
  - Examples: MoveCursor(x,y), Click, Type("continue"), Key(Enter).
- ActionSequence
  - Purpose: ordered list of Actions; executes sequentially; short‑circuit on failure; emits per‑action Events.
- ScreenCapture (RegionSource)
  - Purpose: capture rectangular areas and provide pixels/fast hashes.
  - Contract: capture(region) → pixel buffer; hash(region, downscale) → u64/bytes.
- Automation
  - Purpose: input synthesis (mouse/keyboard) via OS APIs, hidden behind a safe trait.
 - InputCapture
   - Purpose: subscribe to global mouse/keyboard events for recording and tooling.
   - Contract: start()/stop(), subscribe(sender) → push InputEvent (mouse move/button/wheel; key down/up with modifiers).
- Monitor
  - Purpose: orchestrator binding Trigger + Condition + ActionSequence; emits typed Events.
  - Loop: on each Trigger tick, evaluate Condition across Regions; if true and guardrails allow, execute ActionSequence exactly once, then apply cooldown; emit Events at each step; supports start/stop and backpressure.
  - Guardrails: optional limits (e.g., maxActivationsPerHour, maxRuntimeMs) and cooldowns wrapped around the loop; emits Watchdog events when tripped.

Note: The UI deals only with abstract identifiers/types (e.g., Region IDs, Action descriptors) and never calls OS APIs directly.

## Key domain types (shared model)

- Region: { id, rect: { x, y, width, height }, name? }
- RegionSource: the backend providing pixels for Regions (via ScreenCapture).
- Event: discriminated union, e.g., TriggerFired, ConditionEvaluated { result }, ActionStarted/ActionCompleted { actionId, success }, MonitorStateChanged, WatchdogTripped { reason }, Error.
- Profile (JSON): defines Regions, Trigger config, Condition config, and ActionSequence.

Example Profile (conceptual):

```jsonc
{
  "id": "profile-1",
  "name": "MVP Profile",
  "regions": [
    { "id": "r1", "rect": { "x": 100, "y": 120, "width": 640, "height": 200 } },
    { "id": "r2", "rect": { "x": 860, "y": 120, "width": 640, "height": 200 } }
  ],
  "trigger": { "type": "IntervalTrigger", "intervalMs": 500 },
  "condition": { "type": "RegionCondition", "stableMs": 5000, "downscale": 4, "hash": "xxh3" },
  "actions": [
    { "type": "MoveCursor", "x": 1000, "y": 700 },
    { "type": "Click", "button": "left" },
    { "type": "Type", "text": "continue" },
    { "type": "Key", "key": "Enter" }
  ]
}
```

"Keep AI Agent Going" preset (conceptual):

```jsonc
{
  "id": "keep-agent-001",
  "name": "Copilot Keep-Alive",
  "regions": [
    { "id": "chat-out", "rect": { "x": 80, "y": 120, "width": 1200, "height": 600 }, "name": "Agent Output" },
    { "id": "progress", "rect": { "x": 80, "y": 740, "width": 1200, "height": 200 }, "name": "Progress Area" }
  ],
  "trigger": { "type": "IntervalTrigger", "intervalMs": 750 },
  "condition": { "type": "RegionCondition", "stableMs": 8000, "downscale": 4, "hash": "xxh3" },
  "actions": [
    { "type": "MoveCursor", "x": 960, "y": 980 },
    { "type": "Click", "button": "left" },
    { "type": "Type", "text": "continue" },
    { "type": "Key", "key": "Enter" }
  ],
  "guardrails": { "maxRuntimeMs": 10800000, "maxActivationsPerHour": 120, "cooldownMs": 5000 }
}
```

Profile schema (minimal contract):

- profile.id: string (non‑empty)
- profile.name: string
- regions: Region[] where Region = { id: string, rect: { x: number>=0, y: number>=0, width: number>0, height: number>0 }, name?: string }
- trigger: { type: "IntervalTrigger", intervalMs: number>0 }
- condition: { type: "RegionCondition", stableMs: number>0, downscale: number>=1, hash: "xxh3" }
- actions: Action[] (order significant) where
  - MoveCursor { type: "MoveCursor", x: number>=0, y: number>=0 }
  - Click { type: "Click", button: "left" | "right" | "middle" }
  - Type { type: "Type", text: string }
  - Key { type: "Key", key: string }
- guardrails?: { maxRuntimeMs?: number>0, maxActivationsPerHour?: number>0, cooldownMs?: number>=0 }

## Tauri bridge (commands and events)

- Commands (Rust):
  - profiles_load() -> Result<Profile[], Error>
  - profiles_save(profiles: Profile[]) -> Result<(), Error>
  - monitor_start(profileId: String) -> Result<(), Error>
  - monitor_stop() -> Result<(), Error>
  - region_pick() -> Result<Region, Error> (optional helper using overlay)
  - start_screen_stream() / stop_screen_stream() -> control an optional low‑FPS screen stream for authoring
  - start_input_recording() / stop_input_recording() -> control global input recorder (authoring)
  - inject_mouse_event(event: MouseEvent) / inject_keyboard_event(event: KeyboardEvent) -> direct input replay for tooling
- Events to UI:
  - Channel: "loopautoma://event"; payload = Event (JSON)
  - Backpressure: events may be batched ≤100ms; if buffer >10_000, drop oldest and emit Error { message: "event_backpressure_drop" }
  - Authoring streams: ScreenFrame (throttled) and InputEvent are emitted on dedicated channels or with a `kind` discriminator; apply strict throttling and backpressure.

## UI responsibilities (React/TypeScript, no OS logic)

- Profile editor: define Regions (via selection tool), Trigger (interval), Condition (stable duration, downscale), and ActionSequence.
- Monitor control: Start/Stop + status; live Event log/metrics.
- Unattended mode: toggle to enable guardrails (max runtime/activations, cooldowns) and a prominent Panic Stop button; preset selector (e.g., “Copilot Keep‑Alive”).
- State management: Zustand store; React Query optional for command calls; types mirror Rust models.
- Serialization: JSON round‑trip to/from backend; validation errors surfaced inline.
 - Authoring helpers (Ubuntu/X11 MVP): recording bar to start/stop input capture, region selection overlay, and an optional screen preview; future OSes reuse the same UI.

## Platform implementations (per OS, behind traits)

Ubuntu/X11 MVP (primary focus):
- ScreenCapture: `xcap` crate (PipeWire + SPA + Xorg helpers) provides monitor/region capture, hashing, and display enumeration. Requires PipeWire/SPA headers and clang/LLVM for bindgen; hashes are computed directly on captured RGBA buffers.
- InputCapture: XInput2 + XKB remain the long‑term target; interim builds rely on the `device_query` crate to unblock authoring tooling until native X11 hooks land.
- Automation (Input replay): XTest extension is still the target abstraction; interim builds use `enigo` as a placeholder while we wire XTest for deterministic pointer/keyboard synthesis.
- Note: requires an X11 session for MVP; Wayland remains out of scope.

macOS (post‑MVP):
- ScreenCapture via CGDisplayStream; Automation via Quartz Events; InputCapture via event taps.

Windows 11 (post‑MVP):
- ScreenCapture via Desktop Duplication API (DXGI); Automation via SendInput; InputCapture via Raw Input/Low‑level hooks.

All backends are hidden behind ScreenCapture, Automation, and InputCapture traits; selected via cfg(target_os) and feature flags.

## Performance strategy (MVP)

- Downscale Regions (e.g., to ~160 px width) before hashing (xxhash/xxh3) to cut CPU/memory.
- Stable duration tracked by comparing successive hashes; short‑circuit on first change.
- IntervalTrigger uses a monotonic timer; jitter acceptable but bounded.
- Minimal allocations in hot paths; reuse buffers per Region.
 - Guardrails avoid runaway loops (cooldowns/rate limits) to reduce CPU and unintended behavior when conditions flap.
 - Authoring streams (screen/input) are strictly throttled and disabled in unattended runs.

## Testing strategy and coverage

- Core/domain: pure unit tests with fake ScreenCapture and Automation; deterministic hash fixtures.
- Runtime: integration tests for Monitor loop using virtual time and fake backends; property tests for stability detection.
- UI: component tests + contract tests against mocked commands; E2E with Tauri driver or Playwright (headless) to start/stop Monitor and assert Events.
- CI: cargo test + tarpaulin for Rust coverage, Vitest for UI; combine and upload to Codecov. Gate: overall coverage ≥90% before merging.
 - Soak tests (time‑dilated where possible) to validate unattended operation: ensure no memory leaks, watchdog trips as configured, and correct recovery after stop/start.
 - Ubuntu/X11 backends: add integration tests behind feature gates where possible; mock X11 when CI access is limited.

## Extensibility points

- New Trigger/Condition/Action types extend traits without changing existing code; registered in a factory/registry that maps JSON descriptors to concrete types.
- Future Conditions can perform OCR on Regions and feed text to LLMs to generate Action inputs; this only requires new Condition and Action implementations, not architectural changes.
 - Additional safety Conditions (e.g., WindowFocusCondition, AllOfCondition) can be composed to restrict actions to a bound application window; implemented as standard Conditions without UI/OS branching.
 - Backends: implement ScreenCapture, Automation, and InputCapture for each OS under separate modules; no UI changes required.

## Unattended operation: design notes

- Bounded scope: Profiles explicitly define Regions; hashes only (no pixel persistence by default) to respect privacy.
- Panic stop: immediate termination of Monitor loop from UI or hotkey; emits MonitorStateChanged and ensures idempotent shutdown.
- Guardrails: max runtime, max activations/hour, and cooldown between activations; all configurable per Profile.
- Resilience: on crash/restart, Profiles reload and default to stopped; start is explicit.
- Focus binding (optional extension): a Condition variant may assert the expected app/window is focused before actions occur.

## Monitor semantics (state machine)

- States: Stopped → Running → Stopping → Stopped
- Start: monitor_start(profileId) when in Stopped → Running
- Tick: on Trigger tick, evaluate Condition; if true and guardrails allow, execute ActionSequence; apply cooldown
- Panic Stop: transition to Stopping; prevent scheduling of new actions; allow in‑flight Action to finish; emit MonitorStateChanged; then Stopped
