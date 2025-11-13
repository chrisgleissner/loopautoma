# Loop Automa — Lean Rollout Plan (Fast MVP)

Global rule: You may progress only when all tasks are completed, all tests pass, and overall coverage (Rust + UI combined) is ≥90% for the scope of that phase. MVP goal: unattended operation to keep an AI agent (e.g., VS Code Copilot) progressing indefinitely once started, with guardrails and a panic stop. Required reading before coding: `doc/architecture.md` for contracts and `doc/rollout-plan.md` for acceptance gates. Use idiomatic approaches and avoid overengineering—prefer the defaults from Tauri/React/Rust unless the architecture requires an abstraction.

## Phase A — Ship the MVP

Deliverables: a working cross‑platform app that can run unattended with a preset to “keep agent going”, with tests and ≥90% coverage.

- [x] Workspace bootstrapped: Tauri 2 app with Rust backend + React/TypeScript UI.
- [x] Toolchain pinned: Rust stable ≥1.75; TypeScript 5.9; Bun ≥1.3 for UI dev/build/test (preferred). If Bun is incompatible with a required dependency, fall back to Node.js 20 LTS.
- [x] Scaffold the app using Tauri v2’s Bun initializer: `bun create tauri-app` and select React + TypeScript template.
- [x] Core contracts: Rust traits `Trigger`, `Condition`, `Action`, `ActionSequence`, `ScreenCapture`, `Automation`, `Monitor`.
- [x] Shared model: `Region`, `Event` (incl. `WatchdogTripped`, `MonitorStateChanged`), `Profile` JSON schema.
- [x] MVP implementations:
	- [x] `IntervalTrigger`
	- [x] `RegionCondition` (no‑visual‑change with stableMs, downscale, hash)
	- [x] Actions: `MoveCursor`, `Click`, `Type("continue")`, `Key(Enter)` and `ActionSequence`
	- [x] `Monitor` loop with cooldowns and guardrails (`maxActivationsPerHour`, `maxRuntimeMs`)
	- [x] Fake `ScreenCapture`/`Automation` for tests; OS implementations behind traits for runtime
- [x] Tauri bridge: commands `profiles_load/save`, `monitor_start/stop`, optional `region_pick`; event streaming to UI.
- [x] UI MVP: Profile editor, Monitor Start/Stop, live Event log, unattended mode controls (preset selector, guardrail inputs), Panic Stop button.
- [x] Coverage-focused tests:
	- [x] Rust unit/integration tests for Monitor, Condition, Trigger, ActionSequence (with fakes)
	- [x] UI component/contract tests (mock commands)
	- [x] One E2E happy path that runs the preset and asserts Events
- [x] CI: build, tests, coverage (tarpaulin/grcov + vitest) → Codecov; gate: overall coverage ≥90%.
 - [x] Packaging: produce installers/bundles for at least one OS to release MVP quickly.

Gate: all tasks done, tests green, coverage ≥90%, at least one OS bundle produced.

## Phase B — Hardening and Cross‑OS

Deliverables: robustness, performance, cross‑OS validation, and soak stability for unattended runs.

- [ ] OS adapter completeness: ScreenCapture/Automation optimized per OS; FPS caps and buffer reuse.
- [ ] Contract + integration tests across OSes (best‑effort in CI); documented limitations.
- [ ] Soak test (time‑dilated if needed): validates memory/cpu bounds, guardrails, and clean panic stop.
- [ ] Performance pass: lower CPU in hot paths, enforce cooldowns/backoff; document baselines.
- [ ] Security review basics: permissions, sandbox, input‑synthesis safety.
- [ ] Packaging/signing for remaining OSes; smoke matrix.

Gate: all tasks done, tests green, coverage ≥90% (domain/runtime), smoke on all targeted OSes.

## Backlog (post‑B; feature‑flag or follow‑ups)

- [ ] Focus‑binding Condition to restrict actions to a bound app/window.
- [ ] Optional keep‑awake Action (cursor jiggle/sleep inhibition) behind traits.
- [ ] Extension registry and sample plug‑ins (`DelayTrigger`, `NoopAction`).
- [ ] OCR/LLM Conditions + Actions (not MVP).
- [ ] Telemetry opt‑in and privacy doc polish.
