![Logo](./doc/img/logo.png)

# LoopAutoma

[![CI](https://github.com/chrisgleissner/loopautoma/actions/workflows/ci.yaml/badge.svg)](https://github.com/chrisgleissner/loopautoma/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/chrisgleissner/loopautoma/graph/badge.svg?token=IdaePvWHB4)](https://codecov.io/gh/chrisgleissner/loopautoma)
[![License: GPL v2](https://img.shields.io/github/license/chrisgleissner/loopautoma)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-forestgreen)](doc/architecture.md)

> [!NOTE] 
> This project is under active development and not yet fully functional.

Cross‑platform desktop automation to keep AI agents working indefinitely. Watches screen regions and performs actions when conditions are met. 

## Features 🤖
- Keep agents moving: press Enter or click Continue when they stall.
- Run unattended: detect stable/changed UI regions and advance the flow.
- Stay safe: cooldowns, rate limits, max runtime, and a Panic Stop.

## Tech Stack 🛠️
- Tauri 2, Rust 2021, React + TypeScript (Vite), Bun, Vitest
- Cross‑platform: Linux, macOS, Windows

## Quick Start ⚡

- Prereqs and OS notes: [doc/developer.md](doc/developer.md)
- Dev run (full app):
  ```bash
  bun install
  bun run dev
  ```
- Safe mode (no real clicks/keys):
  ```bash
  LOOPAUTOMA_BACKEND=fake bun run tauri dev
  ```
  (or: `LOOPAUTOMA_BACKEND=fake bun run dev`)

Pure web dev (no Tauri window):
  ```bash
  bun run dev:web
  ```

Builds:
  ```bash
  # full Tauri bundles
  bun run build

  # web-only bundle
  bun run build:web
  ```

### Run in Docker (optional)

You can build a container with all Linux deps (Rust, Bun, Tauri) preinstalled:

```bash
# Build once
docker build -t loopautoma/ci:local .

# Install deps and run UI tests
docker run --rm -v "$PWD:/workspace" -w /workspace loopautoma/ci:local \
  bash -lc 'bun install && bun run test:ui:cov'

# Run Rust tests
docker run --rm -v "$PWD:/workspace" -w /workspace loopautoma/ci:local \
  bash -lc 'cd src-tauri && cargo test --all --locked'
```

Our CI uses this same image and uploads coverage to Codecov.

CI is container-native: jobs run inside the prebuilt image (no repeated `docker run` wrappers). The image prewarms Bun and compiles Rust dependencies so test jobs don’t re-download crates on each run.
## Docs 📚
- Architecture: [doc/architecture.md](doc/architecture.md)
- Rollout plan: [doc/rollout-plan.md](doc/rollout-plan.md)
- Dev setup: [doc/developer.md](doc/developer.md)

## License 📄
GPL‑2.0 — see [LICENSE](LICENSE).
