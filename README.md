![Logo](./doc/img/logo.png)

# Loopautoma

[![CI](https://github.com/chrisgleissner/loopautoma/actions/workflows/ci.yml/badge.svg)](https://github.com/chrisgleissner/loopautoma/actions/workflows/ci.yml)
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
- Dev run:
  ```bash
  bun install
  bun run tauri dev
  ```
- Safe mode (no real clicks/keys):
  ```bash
  LOOPAUTOMA_BACKEND=fake bun run tauri dev
  ```
## Docs 📚
- Architecture: [doc/architecture.md](doc/architecture.md)
- Rollout plan: [doc/rollout-plan.md](doc/rollout-plan.md)
- Dev setup: [doc/developer.md](doc/developer.md)

## License 📄
GPL‑2.0 — see [LICENSE](LICENSE).
