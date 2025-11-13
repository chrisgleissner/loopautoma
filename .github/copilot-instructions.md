# Copilot Agent Instructions (Required Reading)

This repository is designed for automated implementation by an LLM agent. Follow these rules strictly.

## Required reading

- doc/architecture.md — Target architecture and exact contracts
- doc/rollout-plan.md — Lean rollout plan and acceptance gates
- doc/developer.md — Local setup notes, Linux prerequisites, and troubleshooting

You must read both before writing code. If in doubt, re-open and re-read.

## Tooling (MVP)

- Rust stable (edition 2021) ≥ 1.75
- Tauri 2 (stable) — see pinned versions in architecture.md
- TypeScript 5.x (latest stable)
- Bun ≥ 1.3 for UI dev/build/test (preferred). If Bun causes blocking compatibility issues with Tauri tooling or libraries, fall back to Node.js 20 LTS.


## Non-negotiables

- Abstractions: implement traits exactly as specified (Trigger, Condition, Action, ActionSequence, ScreenCapture, Automation, Monitor).
- No OS-specific logic in TypeScript. All platform specifics live behind Rust traits.
- Coverage gate: overall (Rust + UI) ≥ 90% for each phase.
- E2E: at least one happy-path scenario proving unattended operation works.
- Guardrails: implement cooldown, maxActivationsPerHour, maxRuntimeMs, Panic Stop.

Keep it idiomatic:

- Prefer idiomatic Tauri, Rust, and React patterns. Do not overengineer. Only introduce abstractions explicitly required by doc/architecture.md.

## Build, run, and test commands

Local development:

- Dev app window: `bun run tauri dev`
- UI tests: `bun test` (enable coverage with `bun test --coverage`)
- Rust tests: `cargo test` (run from the folder containing `src-tauri/`)
- Build installers: `bun run tauri build`

Rust toolchain (required):

```bash
curl https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
cargo --version
```

Linux prerequisites (Ubuntu/Debian): install WebKitGTK 4.1, libsoup3, GTK3, etc. (see doc/developer.md). Example:

```bash
sudo apt update
sudo apt install -y pkg-config build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev patchelf
```

## CI workflow

- A GitHub Actions workflow is provided in `.github/workflows/ci.yml`.
- On push/PR: installs Linux deps, sets up Bun and Rust, then runs UI tests (if `package.json` exists) and Rust tests (if `src-tauri/` exists).
- Coverage reporting/gating: required at ≥90% per doc; wire up Codecov as soon as tests exist. For now, CI runs tests and can emit coverage if configured.

## Testing approach (idiomatic, no Xvfb)

- Rust unit/integration: test core contracts with fake backends; avoid OS dependencies. Run with `LOOPAUTOMA_BACKEND=fake`.
- UI component/contract tests: Vitest + React Testing Library; mock Tauri commands/events.
- Optional web-mode E2E: Playwright against Vite/`dist/` with a minimal Tauri shim; no desktop window.
- Defer real desktop E2E (Tauri window + X server) until post‑MVP. Keep one smoke only when added.

CI defaults:
- Run Rust tests under `src-tauri/` with `LOOPAUTOMA_BACKEND=fake` to keep tests deterministic.
- Run UI tests via Vitest with coverage; upload both UI and Rust coverage to Codecov.

## Monitor semantics

- On each Trigger tick, evaluate Condition across Regions.
- If true and guardrails allow, execute ActionSequence exactly once, then apply cooldown.
- Emit Events at each step; stream to the UI.
- Panic Stop is immediate and idempotent.

## Contracts & schema

- Use the Profile schema in doc/architecture.md verbatim for JSON profiles.
- Tauri commands and event channel names/types must match doc/architecture.md.

## Implementation hints

- Start with fakes for ScreenCapture/Automation to maximize testability; land OS impls behind traits.
- Prefer small, composable modules; avoid premature generalization.
- Validate profiles and fail fast with precise error messages.

## Safety & privacy

- Do not persist raw pixel buffers by default. Hashes only for change detection.
- Expose an obvious Panic Stop in the UI; monitor watchdog Events.
