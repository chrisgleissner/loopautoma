# Loop Automa — Target Architecture Overview

<!-- markdownlint-disable MD005 MD007 MD029 MD032 MD033 -->

This document defines the target architecture for a cross‑platform desktop app built with Tauri 2, a Rust backend, and a React/TypeScript UI. It uses the following abstract entities everywhere (no OS logic in the UI): Trigger, Condition, Action, ActionSequence, Monitor, Event, Region/RegionSource. The initial primary use case is unattended operation to keep an AI agent progressing indefinitely once started.

MVP target platform (scope): Ubuntu 24.04 on X11. The architecture preserves clean extension points for macOS and Windows 11, which will be implemented after the Ubuntu/X11 MVP phases are complete. Wayland is out‑of‑scope for the MVP.

## Tooling and versions (MVP)

- Rust stable (edition 2021) ≥1.75 (latest as of Nov 2025 is 1.91.x)
- UI runtime/build: Bun ≥1.3 (preferred). If blocked by compatibility, fall back to Node.js 20 LTS.
- Tauri 2 (stable; latest tag series ~2.9.x)
- TypeScript 5.x (latest stable is 5.9)
- Testing: Rust (cargo test + `cargo llvm-cov`), UI (Vitest + React Testing Library) or `bun test`, E2E (Playwright)

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
- Unattended operation: runs safely without a user present, with strong guardrails (watchdog, rate limits, bounded scope) and clear stop controls.
 - MVP scope explicitly targets Ubuntu/X11; other OSes must be supportable by adding backends behind the same traits without modifying UI or core contracts.

## Layered architecture (modules and data flow)

Top to bottom layers; arrows indicate primary call/flow direction.

1) Desktop shell (Tauri App)
   - React/TypeScript Web UI (no OS branching)
   - Tauri commands/events bridge
   ↓
2) Adapter layer (tauri-bridge)
   - Exposes Rust commands to UI (start/stop Monitor, create/update Profiles, Region selection, etc.)
   - Forwards Events to UI via a Tauri event channel
   ↓
3) Application layer (runtime)
  - Monitor: orchestrates Trigger → Condition evaluation → ActionSequence execution → Event emission
  - Profile Manager (JSON load/save/validate; schema versioning)
  - Event Bus (typed, async channel)
  - Watchdog and Guardrails: max runtime/activations, cooldowns, and rate limiting applied around Monitor
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
Trigger fires → Event(trigger_fired) → Condition evaluates Regions (via ScreenCapture/RegionSource) → Event(condition_evaluated) → if true, execute ActionSequence via Automation → Event(action_executed) → all Events are emitted to the UI over the event channel.

Recording/authoring flow (helpers):
- Region picker overlay, thumbnail capture, and the input recorder feed the UI with lightweight data during authoring; these helpers are not required for unattended operation but support profile setup and validation.

## Core abstractions (Rust traits)

Interfaces are intentionally minimal; implementations can extend via associated types/feature flags as needed.

- Trigger
  - Purpose: determines when/how a Condition is evaluated.
  - Contract: async tick() produces a signal; e.g., IntervalTrigger with user‑defined cadence.
  - Configuration: IntervalTrigger exposes `check_interval_sec`, the time between evaluations of the Trigger/Condition pair. Profiles may choose any value between 0.1 seconds and 86 400 seconds (24 hours). For the RegionCondition “no change in Regions” preset, the default is 60 seconds.
- Condition
  - Purpose: abstract predicate on environment/system state.
  - MVP: RegionCondition tracks consecutive evaluations with consistent change/no-change states. Triggers when N consecutive checks all have the expected state (change or no-change).
  - Algorithm: After each evaluation, increments `consecutive_same_state` counter if the change status matches the previous evaluation; resets to 1 if it differs. Triggers when counter >= `consecutive_checks`.
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
  "trigger": { "type": "IntervalTrigger", "check_interval_sec": 60 },
  "condition": { "type": "RegionCondition", "consecutive_checks": 3, "expect_change": false },
  "actions": [
    { "type": "MoveCursor", "x": 1000, "y": 700 },
    { "type": "Click", "button": "left" },
    { "type": "Type", "text": "continue" },
    { "type": "Key", "key": "Enter" }
  ]
}
```

"Keep AI Agent Active" preset (conceptual):

```jsonc
{
  "id": "keep-agent-001",
  "name": "Keep AI Agent Active",
  "regions": [
    { "id": "chat-out", "rect": { "x": 80, "y": 120, "width": 1200, "height": 600 }, "name": "Agent Output" },
    { "id": "progress", "rect": { "x": 80, "y": 740, "width": 1200, "height": 200 }, "name": "Progress Area" }
  ],
  "trigger": { "type": "IntervalTrigger", "check_interval_sec": 60 },
  "condition": { "type": "RegionCondition", "consecutive_checks": 5, "expect_change": false },
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
- trigger: { type: "IntervalTrigger", check_interval_sec: number in [0.1, 86400] }
- condition: { type: "RegionCondition", consecutive_checks: number in [1, 10], expect_change: boolean }
- actions: Action[] (order significant) where
  - MoveCursor { type: "MoveCursor", x: number>=0, y: number>=0 }
  - Click { type: "Click", button: "left" | "right" | "middle" }
  - Type { type: "Type", text: string } (supports variable expansion like $prompt)
  - Key { type: "Key", key: string }
  - LLMPromptGeneration { type: "LLMPromptGeneration", region_ids: string[], risk_threshold: number in [0.0, 1.0], system_prompt?: string, variable_name?: string }
- guardrails?: { maxRuntimeMs?: number>0, maxActivationsPerHour?: number>0, cooldownMs?: number>=0 }

## Tauri bridge (commands and events)

- Commands (Rust):
  - profiles_load() -> Result<ProfilesConfig, Error> where ProfilesConfig = { version: number, profiles: Profile[] }
  - profiles_save(config: ProfilesConfig) -> Result<(), Error>
  - monitor_start(profileId: String) -> Result<(), Error>
  - monitor_stop() -> Result<(), Error>
  - monitor_panic_stop() -> Result<(), Error>
  - region_picker_show() / region_picker_complete(submission) / region_picker_cancel() -> manage full-screen overlay selection and emit Region + thumbnail
  - region_capture_thumbnail(rect) -> Result<Option<Base64Png>, Error>
  - action_recorder_show() -> Result<Base64Png, Error> - Captures full-screen screenshot, returns as base64 PNG for Action Recorder UI
  - action_recorder_close() -> restores main window after Action Recorder closes
- Events to UI:
  - Channel: "loopautoma://event"; payload = Event (JSON)
  - Backpressure: events may be batched ≤100ms; if buffer >10_000, drop oldest and emit Error { message: "event_backpressure_drop" }
  - Authoring helpers: InputEvent messages are emitted on dedicated channels or with a `kind` discriminator; apply strict throttling and backpressure.

## UI responsibilities (React/TypeScript, no OS logic)

- Profile editor: define Regions (via selection tool), Trigger (interval), Condition (stable duration, downscale), and ActionSequence.
- Monitor control: Start/Stop + status; live Event log/metrics.
- Unattended mode: toggle to enable guardrails (max runtime/activations, cooldowns); preset selector (e.g., “Keep AI Agent Active”).
- State management: Zustand store; React Query optional for command calls; types mirror Rust models.
- Serialization: JSON round‑trip to/from backend; validation errors surfaced inline.
- Authoring helpers: recording bar to start/stop input capture plus the region selection overlay with thumbnail refresh; all OSes reuse the same UI over OS-specific backends.

## Platform implementations (per OS, behind traits)

Ubuntu/X11 MVP (primary focus):
- ScreenCapture: `xcap` crate (PipeWire + SPA + Xorg helpers) provides monitor/region capture, hashing, and display enumeration. Requires PipeWire/SPA headers and clang/LLVM for bindgen; hashes are computed directly on captured RGBA buffers.
- InputCapture: implemented with the `rdev` crate (v0.5.3+), which uses X11's XRecord extension internally for global input monitoring. XRecord is specifically designed for recording all system input events, unlike XInput2 which is designed for application-specific input handling and rejects RAW event registration from windowless applications. The rdev library provides a proven, cross-platform abstraction over XRecord (Linux), event taps (macOS), and low-level hooks (Windows). Note: `rdev::listen()` blocks forever by design (XRecord's `XRecordEnableContext` blocks until explicitly disabled from another thread), so the implementation uses `std::process::exit(0)` when the stop signal is detected via the `running` atomic flag.
- Automation (Input replay): implemented via the XTest extension on Ubuntu/X11 for deterministic pointer/keyboard synthesis, with layout-aware key mapping via XKB.
- Note: requires an X11 session for MVP; Wayland remains out of scope.

### Action Recorder: UI-Level Input Capture (Current Implementation)

**Design Philosophy:** Rather than capturing OS-level input events across the entire system, the Action Recorder provides a controlled UI environment where users click and type directly on a screenshot. This approach is simpler, more secure, and avoids X11/Wayland compatibility issues.

**How it works:**
1. User clicks "Record Actions" button
2. Main window minimizes, full-screen screenshot captured (reuses region_picker_show logic)
3. Action Recorder window opens fullscreen with:
   - Screenshot displayed at 80% scale (left/bottom aligned)
   - Click handlers capture coordinates and convert to real screen positions
   - Keyboard handlers buffer text input and capture special keys
   - Right panel shows numbered action list with icons
4. Each action gets a teardrop-shaped number marker overlaid at the click position
5. On "Done", actions are converted to ActionConfig[] and added to the selected profile

**Coordinate scaling:** Click at display position (x_d, y_d) on 80% scaled screenshot → real screen coordinate (x_r, y_r) = (x_d / 0.8, y_d / 0.8). Markers positioned inversely: real coord (x_r, y_r) → display position (x_r * 0.8, y_r * 0.8).

**Benefits over OS-level capture:**
- No X11/Wayland compatibility issues
- No elevated permissions required
- No global input hooks or background threads
- Simpler mental model: click where you want the action to happen
- Visual feedback: see exactly what you're recording
- Easy to adjust actions before committing

**Removed from MVP:** OS-level InputCapture trait, rdev dependency, LinuxInputCapture implementation, start/stop_input_recording commands, InputEvent/KeyboardEvent/MouseEvent types. All removed in favor of the simpler UI-level approach.

macOS (post‑MVP):
- ScreenCapture via CGDisplayStream; Automation via Quartz Events; InputCapture via event taps.

Windows 11 (post‑MVP):
- ScreenCapture via Desktop Duplication API (DXGI); Automation via SendInput; InputCapture via Raw Input/Low‑level hooks.

All backends are hidden behind ScreenCapture, Automation, and InputCapture traits; selected via cfg(target_os) and feature flags.

## Authoring helpers: regions and action recorder

Authoring flows are supported by two helpers that expose extra context to the UI while keeping runtime logic OS-agnostic:

- **Region overlay** — a full-screen transparent window used to define Rects:
  - Maps pointer drags (upper-left → lower-right) to global screen coordinates and submits them to the backend as a RegionPickSubmission.
  - Backend captures screenshot thumbnail of selected region for visual confirmation.
  
- **Action Recorder** — a full-screen UI overlay displaying a captured screenshot where users click and type to record actions:
  - User clicks "Record Actions" → main window minimizes → screenshot captured
  - Action Recorder window shows 80% scaled screenshot with click/keyboard handlers
  - Clicks are captured with coordinate conversion (display → real screen coordinates)
  - Keyboard input is buffered into text actions
  - Each action gets a numbered teardrop marker overlay
  - On completion, actions are converted to ActionConfig[] and added to the profile
  - No OS-level input hooks required - all interaction happens within the UI

Implementation notes:

- Both helpers reuse `capture_full_screen()` to capture desktop screenshots after minimizing the main window.
- If `LOOPAUTOMA_BACKEND=fake` is set in tests, commands succeed but return placeholder data.
- Action Recorder eliminates the need for OS-level input capture (XRecord, event taps, hooks), greatly simplifying the implementation and avoiding platform compatibility issues.

## Performance strategy (MVP)

- Downscale Regions (e.g., to ~160 px width) before hashing (xxhash/xxh3) to cut CPU/memory.
- Stable duration tracked by comparing successive hashes; short‑circuit on first change.
- IntervalTrigger uses a monotonic timer; jitter acceptable but bounded.
- Minimal allocations in hot paths; reuse buffers per Region.
 - Guardrails avoid runaway loops (cooldowns/rate limits) to reduce CPU and unintended behavior when conditions flap.
 - Authoring helpers (screen snapshots/input recorder) are strictly throttled and disabled in unattended runs.

## Testing strategy and coverage

- Core/domain: pure unit tests with fake ScreenCapture and Automation; deterministic hash fixtures.
- Runtime: integration tests for Monitor loop using virtual time and fake backends; property tests for stability detection.
- UI: component tests + contract tests against mocked commands; E2E with Tauri driver or Playwright (headless) to start/stop Monitor and assert Events.
- CI: cargo test + `cargo llvm-cov` for Rust coverage, Vitest for UI; combine and upload to Codecov. Gate: overall coverage ≥90% before merging.
 - Soak tests (time‑dilated where possible) to validate unattended operation: ensure no memory leaks, watchdog trips as configured, and correct recovery after stop/start.
 - Ubuntu/X11 backends: add integration tests behind feature gates where possible; mock X11 when CI access is limited.

## LLM Prompt Generation Action

The LLMPromptGeneration action enables dynamic prompt generation based on screen content with risk-based guardrails.

### How it works

1. **Screen Capture**: Captures specified regions using the ScreenCapture trait
2. **LLM Call**: Sends base64-encoded PNG images to GPT-4 Vision API with system prompt and risk guidance
3. **Risk Assessment**: LLM returns JSON with `{ "prompt": string, "risk": float }` where risk is 0.0–1.0
4. **Threshold Validation**: Compares LLM risk against user's risk_threshold
5. **Variable Population**: If risk acceptable, sets variable (default: $prompt) in ActionContext
6. **Abort on High Risk**: If risk > threshold, plays audible alarm and aborts sequence

### Risk Levels

- **Low Risk (0.0–0.33)**: Safe operations inside workspace, no deletions, no external communication
- **Medium Risk (0.34–0.66)**: Git operations, file management inside workspace
- **High Risk (0.67–1.0)**: Operations outside workspace, elevated privileges, software installation, data transfer

### Configuration

Environment variables for LLM integration:
- `OPENAI_API_KEY`: Required for real LLM calls (falls back to mock if missing)
- `OPENAI_API_ENDPOINT`: Optional, defaults to `https://api.openai.com/v1/chat/completions`
- `OPENAI_MODEL`: Optional, defaults to `gpt-4-vision-preview`
- `LOOPAUTOMA_BACKEND=fake`: Use mock LLM for testing

### Variable Expansion

Subsequent Type actions can reference generated variables using `$variable_name` syntax:

```jsonc
{
  "actions": [
    {
      "type": "LLMPromptGeneration",
      "region_ids": ["chat-out"],
      "risk_threshold": 0.5,
      "variable_name": "prompt"
    },
    {
      "type": "Type",
      "text": "$prompt"  // Expands to LLM-generated value
    },
    { "type": "Key", "key": "Enter" }
  ]
}
```

### ActionContext

Global variable store that persists within a single monitor activation:
- Variables reset on monitor start
- Multiple LLM actions can set different variables
- Variables are expanded in Type actions before execution
- Accessible via context.get(name) and context.set(name, value)

## Extensibility points

- New Trigger/Condition/Action types extend traits without changing existing code; registered in a factory/registry that maps JSON descriptors to concrete types.
- LLM Prompt Generation demonstrates extensibility: new action type with screen capture, external API calls, and variable management.
 - Additional safety Conditions (e.g., WindowFocusCondition, AllOfCondition) can be composed to restrict actions to a bound application window; implemented as standard Conditions without UI/OS branching.
 - Backends: implement ScreenCapture, Automation, and InputCapture for each OS under separate modules; no UI changes required.

## Unattended operation: design notes

- Bounded scope: Profiles explicitly define Regions; hashes only (no pixel persistence by default) to respect privacy.
- Stop command: immediate termination of the Monitor loop from UI or hotkey; emits MonitorStateChanged and ensures idempotent shutdown.
- Guardrails: max runtime, max activations/hour, and cooldown between activations; all configurable per Profile.
- Resilience: on crash/restart, Profiles reload and default to stopped; start is explicit.
- Focus binding (optional extension): a Condition variant may assert the expected app/window is focused before actions occur.

## Secure credential storage

OpenAI API keys and model preferences are stored securely using the OS-native keyring via `tauri-plugin-store` v2.4.1:

- **macOS**: Keychain Services API
- **Windows**: Windows Credential Manager
- **Linux**: Secret Service API (GNOME Keyring, KWallet)

Keys are encrypted at rest by the OS and never stored in plaintext. The Rust backend (`src-tauri/src/secure_storage.rs`) wraps the plugin and exposes:

- `get_openai_key() -> Option<String>`
- `set_openai_key(key: &str)`
- `delete_openai_key()`
- `get_openai_model() -> Option<String>`
- `set_openai_model(model: &str)`

The UI (`src/components/SettingsPanel.tsx`) provides a single settings dialog for managing credentials. API keys are masked in the UI (shown as `sk-••••••••••••••••`) and saved via Tauri commands. Users can replace or delete keys at any time.

For detailed security best practices and troubleshooting, see [doc/secureStorage.md](secureStorage.md).

## Intelligent Termination System

Profiles terminate automatically based on multiple concurrent signals, eliminating the need for manual intervention.

### Termination Signals

1. **AI Task Completion** — LLM analyzes screen content and returns structured response with `task_complete: true`
2. **OCR Pattern Matching** — Offline OCR detects success/failure keywords in specified regions (uni-ocr)
3. **Guardrail Limits** — Max runtime, max activations, consecutive failures, action timeout
4. **Heartbeat Watchdog** — Detects stuck loops when no progress for N milliseconds (Airflow pattern)
5. **TerminationCheck Action** — Explicit action to inspect context/OCR/AI and decide termination

Any signal can trigger termination. Monitor emits detailed events and plays audio notifications.

### Structured AI Response Schema

All LLM calls return JSON with exact structure:

```typescript
{
  continuation_prompt: string | null,       // Text for next iteration, null if complete
  continuation_prompt_risk: number,         // Risk level 0.0-1.0 of continuation
  task_complete: boolean,                   // True if task finished
  task_complete_reason: string | null       // Explanation of completion
}
```

**Retry Logic:**
- Invalid JSON → retry with correction prompt (max 3 attempts)
- Fallback keyword parsing: scan for DONE/COMPLETE/FINISHED → `task_complete: true`
- All failures → log error and continue (don't terminate)

**Variable Expansion:**
- `continuation_prompt` stored in ActionContext
- Available to subsequent Type actions via `$continuation_prompt`
- `task_complete_reason` logged in termination event

### OCRCapture Trait

```rust
pub trait OCRCapture: Send + Sync {
    /// Extract text from region using OCR (uni-ocr)
    fn extract_text(&self, region: &Region) -> Result<String, String>;
    
    /// Extract text with 1-second cache (invalidated by region hash change)
    fn extract_text_cached(&self, region: &Region) -> Result<String, String>;
}
```

**Implementation:** LinuxOCRCapture uses uni-ocr (Tesseract-based) with English language pack. Threaded nonblocking extraction. Cache per region using `parking_lot::RwLock<HashMap<RegionId, (String, Instant)>>`.

**Accuracy Tips:**
- High contrast regions (white on black or vice versa)
- Large fonts (min 12pt)
- Sans-serif fonts (Arial, Helvetica)
- No overlays or semi-transparent UI

### TerminationCheck Action

Explicit action for mid-sequence termination logic:

```typescript
{
  type: "TerminationCheck",
  check_type: "context" | "ocr" | "ai_query",
  context_vars?: string[],              // Variables to inspect for context check
  ocr_region_ids?: string[],            // Regions to scan for OCR check
  termination_condition: string,        // Regex or logic expression
  ai_query_prompt?: string              // Custom prompt for AI query check
}
```

**Execution:**
1. `context` check: inspect ActionContext variables against condition
2. `ocr` check: extract text from regions and match regex pattern
3. `ai_query` check: call LLM with custom prompt, check `task_complete`
4. If condition met: set `context.should_terminate = true` and stop sequence early

**Example:**

```json
{
  "actions": [
    { "type": "Type", "text": "check status" },
    { "type": "Key", "key": "Enter" },
    {
      "type": "TerminationCheck",
      "check_type": "ocr",
      "ocr_region_ids": ["result-panel"],
      "termination_condition": "(?i)(complete|finished|done)"
    }
  ]
}
```

### Heartbeat Watchdog

**Mechanism:** Tracks `last_action_progress: Option<Instant>` in Monitor. Each action in ActionSequence updates this timestamp. If no progress for `heartbeat_timeout_ms`, watchdog trips.

**Airflow Pattern:** Inspired by Apache Airflow's task heartbeat. Detects:
- Stuck actions (waiting for UI that never appears)
- Infinite loops in action logic
- Long-running external processes that hang

**Configuration:**

```json
{
  "guardrails": {
    "heartbeat_timeout_ms": 60000  // 60 seconds
  }
}
```

**Behavior:**
- On timeout: emit `WatchdogTripped { reason: "heartbeat_stalled" }`
- Play intervention audio notification
- Stop monitor gracefully

### AudioNotifier Trait

```rust
pub trait AudioNotifier: Send + Sync {
    /// Play urgent alarm (watchdog, failures, intervention needed)
    fn play_intervention_needed(&self);
    
    /// Play completion chime (graceful termination, success)
    fn play_profile_ended(&self);
    
    /// Set volume 0.0-1.0
    fn set_volume(&mut self, volume: f32);
    
    /// Enable/disable audio
    fn set_enabled(&mut self, enabled: bool);
}
```

**Implementation:** RodioAudioNotifier using rodio crate v0.18+. Two embedded WAV files:
- `intervention.wav` — Urgent alarm tone (500ms, 3 beeps)
- `completed.wav` — Pleasant completion chime (300ms)

**Storage:** Audio preferences in secure storage (OS keyring):
- `audio_enabled`: bool (default: true)
- `audio_volume`: f32 (default: 0.7)

**UI Controls:**
- Settings panel: enable/disable toggle, volume slider (0-100%)
- Test buttons for each sound type

### Guardrails Extensions

```typescript
type GuardrailsConfig = {
  // Existing
  max_runtime_ms?: number;
  max_activations_per_hour?: number;
  cooldown_ms: number;
  
  // New termination fields
  action_timeout_ms?: number;              // Stop if single action > N ms
  heartbeat_timeout_ms?: number;           // Stop if no progress for N ms
  max_consecutive_failures?: number;       // Stop after N failed sequences
  success_keywords?: string[];             // Regex patterns for success
  failure_keywords?: string[];             // Regex patterns for failure
  ocr_termination_pattern?: string;        // General regex for OCR
  ocr_region_ids?: string[];               // Which regions to scan
};
```

**Validation:**
- At least one termination condition recommended (UI warning if none)
- Patterns must be valid regex
- `action_timeout_ms` > 0
- `heartbeat_timeout_ms` >= 10000 (10s minimum)
- `max_consecutive_failures` >= 3 (recommended)

### Monitor Termination Flow

```text
Monitor.tick()
  ├─ Check max_runtime → WatchdogTripped?
  ├─ Check heartbeat_timeout → WatchdogTripped(heartbeat_stalled)?
  ├─ Trigger.should_fire() → TriggerFired?
  ├─ Check cooldown → skip?
  ├─ Condition.evaluate() → ConditionEvaluated
  ├─ Scan OCR regions for success/failure keywords → terminate?
  ├─ Check max_activations_per_hour → WatchdogTripped?
  ├─ ActionSequence.run()
  │   ├─ For each action:
  │   │   ├─ Check action_timeout → timeout?
  │   │   ├─ Execute action
  │   │   ├─ Update heartbeat: last_action_progress = Some(now)
  │   │   ├─ If TerminationCheck: inspect + set should_terminate
  │   │   └─ If context.should_terminate → stop early
  │   └─ Return success/failure
  ├─ If LLMPromptGeneration returned task_complete=true → terminate
  ├─ Track consecutive failures → max_consecutive_failures?
  ├─ Play audio: intervention (failures) or completed (success)
  └─ Emit events: TerminationCheckTriggered, TaskCompleted, OCRPatternMatched
```

### New Event Types

```rust
pub enum Event {
    // ... existing events ...
    TerminationCheckTriggered { reason: String },
    TaskCompleted { reason: String },
    OCRPatternMatched { pattern: String, text: String },
    HeartbeatStalled { elapsed_ms: u64 },
}
```

### Example: AI-Driven Build Monitoring

```json
{
  "name": "Monitor CI Build",
  "regions": [
    {"id": "build-log", "rect": {"x": 100, "y": 200, "width": 1200, "height": 600}},
    {"id": "status", "rect": {"x": 100, "y": 850, "width": 400, "height": 100}}
  ],
  "trigger": {"type": "IntervalTrigger", "check_interval_sec": 30},
  "condition": {"type": "RegionCondition", "consecutive_checks": 1, "expect_change": true},
  "actions": [
    {
      "type": "LLMPromptGeneration",
      "region_ids": ["build-log", "status"],
      "risk_threshold": 0.5,
      "task_completion_check": true,
      "completion_prompt": "Check if build is complete. Look for 'BUILD SUCCESS' or 'BUILD FAILURE' messages."
    }
  ],
  "guardrails": {
    "max_runtime_ms": 1800000,
    "heartbeat_timeout_ms": 120000,
    "success_keywords": ["BUILD SUCCESS"],
    "failure_keywords": ["BUILD FAILURE", "ERROR", "FAILED"]
  }
}
```

For detailed examples and best practices, see [doc/terminationPatterns.md](terminationPatterns.md).

## Monitor semantics (state machine)

- States: Stopped → Running → Stopping → Stopped
- Start: monitor_start(profileId) when in Stopped → Running
- Tick: on Trigger tick, evaluate Condition; if true and guardrails allow, execute ActionSequence; apply cooldown; check termination signals
- Termination: any signal (AI, OCR, guardrails, heartbeat, TerminationCheck) can trigger stop
- Stop command: transition to Stopping; prevent scheduling of new actions; allow in‑flight Action to finish; emit MonitorStateChanged with reason; play audio; then Stopped
