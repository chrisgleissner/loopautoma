![Logo](./doc/img/logo.png)

# LoopAutoma

[![CI](https://github.com/chrisgleissner/loopautoma/actions/workflows/ci.yaml/badge.svg)](https://github.com/chrisgleissner/loopautoma/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/chrisgleissner/loopautoma/graph/badge.svg?token=IdaePvWHB4)](https://codecov.io/gh/chrisgleissner/loopautoma)
[![License: GPL v2](https://img.shields.io/github/license/chrisgleissner/loopautoma)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-forestgreen)](doc/architecture.md)

> [!NOTE] 
> This project is under active development and not yet fully functional. Some of this documentation refers to not yet fully implemented features.

Cross‑platform desktop automation that watches configurable screen regions and performs keyboard/mouse actions when conditions are met. 

## Features
- Keep agents moving: automatically type "Continue" and press enter when an agent stalls.
- Run unattended: detect stable/changed UI regions and advance the flow.
- Stay safe: cooldowns, rate limits, max runtime, and a Panic Stop.

## Get Started

Linux + X11 quickstart:

```bash
git clone https://github.com/chrisgleissner/loopautoma.git
cd loopautoma
bun install
bun run dev
```

Build production bundles (deb/rpm/AppImage):

```bash
bun run build
ls src-tauri/target/release/bundle/
```

See **[doc/install.md](doc/install.md)** for distro packages, troubleshooting, Docker workflows, and alternative setups.

## Tech Stack
- Tauri 2 + Rust 2021 backend
- React + TypeScript (Vite, Bun, Vitest) frontend
- Target platforms: Linux (primary), macOS, Windows

## Docs
- **Installation**: [doc/install.md](doc/install.md) — System requirements, packages, and troubleshooting
- **Architecture**: [doc/architecture.md](doc/architecture.md) — Technical design and contracts
- **Rollout plan**: [doc/rollout-plan.md](doc/rollout-plan.md) — Development roadmap and phases
- **Dev setup**: [doc/developer.md](doc/developer.md) — Building and testing from source

## License
GPL‑2.0 — see [LICENSE](LICENSE).
