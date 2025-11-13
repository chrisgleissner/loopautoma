# Developer Notes — Technical Background

Date: 2025-11-13

This file records environment setup steps already performed locally and offers minimal next steps. It’s not a user guide; it’s a dev scratchpad for context.

Project quick facts

- Desktop shell: Tauri 2 (stable), Rust 2021
- UI: React + TypeScript, Vite, Bun preferred
- Tests: Rust (cargo), UI (Vitest + jsdom), Bun-only tests separated
- Coverage gate (per rollout): ≥90% overall (UI + Rust); enforced in CI
- OS specifics live behind Rust traits; TypeScript stays platform-agnostic

## Steps performed

- `bun create tauri-app`
  - Used to scaffold the Tauri v2 project via Bun with React + TypeScript template.
- `curl https://sh.rustup.rs -sSf | sh`
  - Installed Rust toolchain (rustup + cargo) via the official installer.
- `bun run dev` (full Tauri app)
  - For pure web (no Tauri), use: `bun run dev:web`

## Follow-ups and quick checks (local)

- Load cargo in the current shell session after rustup install:
  - source "$HOME/.cargo/env"
- Verify toolchains:
  - cargo --version
  - bun --version
- If you scaffolded into a subfolder (recommended), change into it before running dev:
  - cd <your-app-folder>
  - bun install
  - bun run dev

## Notes

- On Linux, Tauri requires system dependencies (e.g., WebKitGTK, libsoup3, build tools). If missing, the scaffolder/CLI will list required packages. See Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
- Our doc prefer Bun for UI dev/build/test. If a blocking compatibility issue occurs, fall back to Node.js 20 LTS.
- Keep the project idiomatic and minimal; follow the contracts in `doc/architecture.md` and acceptance gates in `doc/rollout-plan.md`.

### Linux prerequisites (Ubuntu/Debian)

Install the core system packages required by Tauri 2 (WebKitGTK 4.1, libsoup3, GTK3, etc.). This resolves errors like "The system library `libsoup-3.0` required by crate `soup3-sys` was not found."

Suggested packages:

- pkg-config
- build-essential
- libssl-dev
- libgtk-3-dev
- libwebkit2gtk-4.1-dev
- libsoup-3.0-dev
- librsvg2-dev
- patchelf

Example (Ubuntu/Debian):

```bash
sudo apt update
sudo apt install -y pkg-config build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev patchelf libxdo-dev
```

### Linux capture backends (warnings)

We now default to the `xcap` backend on Linux to avoid a Rust future‑incompatibility warning from the `screenshots` crate (0.8.x). `xcap` requires PipeWire/SPA headers and Clang toolchain (installed in the CI image).

Install the extra packages:

```bash
sudo apt install -y libpipewire-0.3-dev libspa-0.2-dev clang llvm-dev libc6-dev
```

Build explicitly with xcap capture feature (default already uses this):

```bash
# from src-tauri/
cargo build --no-default-features --features os-linux-capture-xcap
```

Run the app in dev mode with xcap capture (default):

```bash
# from project root
TAURI_TRIPLE="" bun run tauri dev -- --no-default-features --features os-linux-capture-xcap
```

Opt back into the `screenshots` backend (may emit warnings):

```bash
# from src-tauri/
cargo build --no-default-features --features os-linux-capture

# or run dev from project root
TAURI_TRIPLE="" bun run tauri dev -- --no-default-features --features os-linux-capture
```

Then retry:

```bash
source "$HOME/.cargo/env"
bun run dev
```

## Scripts and common tasks

- Dev app window:

```bash
bun run dev
```

- Pure web dev (no Tauri window):

```bash
bun run dev:web
```

- UI build (typecheck + bundle only):

```bash
bun run build:web
```

- Packaging (Linux bundles: .deb, .rpm, .AppImage):

```bash
bun run build
```

Artifacts land under `src-tauri/target/release/bundle/`.

## Tests and coverage

- Bun unit tests (Bun-only files):

```bash
bun test
```

- UI tests with jsdom + coverage (Vitest):

```bash
bun x vitest run --coverage
```

- Rust tests:

```bash
cd src-tauri
cargo test
```

Conventions to keep runners separate:

- Vitest files use the pattern: `tests/**/*.vitest.{ts,tsx,js,jsx}`.
- Bun-only tests use `*.bun.*` (e.g., `hello.bun.test.ts`).
- Avoid `*.vitest.test.tsx` duplicates; if present, keep as stubs so Bun does not execute jsdom tests.

Coverage:

- UI coverage (istanbul) is computed by Vitest.
- Rust coverage runs in CI (tarpaulin). Local Rust coverage is optional and not required for day-to-day dev.

## Backend selection (fakes vs. OS adapters)

Backends implement the traits `ScreenCapture` and `Automation`.

- Default: OS adapters (feature-gated). On Linux, `os-linux` is enabled by default.
- Force fakes (safe/dev mode):

```bash
LOOPAUTOMA_BACKEND=fake bun run tauri dev
```

Notes (Linux backend):

- The `enigo` crate may require X11 capabilities; on Wayland, behavior can vary by compositor.
- We link libxdo via enigo’s backend; ensure `libxdo-dev` is installed.
- If input synthesis is blocked by the environment (e.g., Wayland restrictions), use `LOOPAUTOMA_BACKEND=fake` for safe development.

Feature flags (Rust crate):

- Defined in `src-tauri/Cargo.toml`:
  - `default = ["os-linux"]`
  - `os-linux`, `os-macos`, `os-windows`

You can compile with a specific target feature set when building the Rust crate directly, e.g.:

```bash
# Build without defaults and enable macOS adapters (example)
cargo build --no-default-features --features os-macos
```

Modules:

- `src-tauri/src/os/linux.rs` → `LinuxCapture`, `LinuxAutomation` (stubs)
- `src-tauri/src/os/macos.rs` → `MacCapture`, `MacAutomation` (stubs)
- `src-tauri/src/os/windows.rs` → `WinCapture`, `WinAutomation` (stubs)

At runtime, selection occurs in `src-tauri/src/lib.rs::select_backends()` using feature gates, with `LOOPAUTOMA_BACKEND=fake` as an override.

## E2E and soak

- E2E happy path test: validates event ordering across start → trigger → condition true → action start → action done.
- Soak test (time-dilated): runs many ticks with short `max_runtime` and asserts watchdog trips and monitor stops cleanly.

Both live in `src-tauri/src/tests.rs` and run via `cargo test`.

## CI basics

- Container-native CI:
  - A reusable workflow builds a GHCR image (loopautoma-ci) keyed by a dependency hash (Dockerfile, Cargo.* and bun lockfiles).
  - Downstream jobs run inside that image via `jobs.<name>.container.image` (no repeated `docker run`).
  - The Dockerfile prewarms Bun cache and compiles Rust dependencies so tests don’t re-download crates on each CI run.
- The CI runs UI tests with coverage and Rust tests/coverage, then uploads to Codecov.
- Coverage gate targeted at ≥90% (see rollout plan).

## Troubleshooting

- `document is not defined` while running Bun tests:
  - Cause: Bun discovered jsdom-based Vitest files.
  - Fix: Ensure Vitest tests use `*.vitest.*` and Bun tests use `*.bun.*`. Keep any `*.vitest.test.tsx` as stubs or rename away from Bun discovery.

- Missing Linux system libraries during Tauri build:
  - Install the packages listed above (WebKitGTK 4.1, libsoup3, GTK3, etc.).

- Rust toolchain not available in current shell:
  - `source "$HOME/.cargo/env"`

