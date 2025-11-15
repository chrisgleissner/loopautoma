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
- Stay safe: cooldowns, rate limits, and guardrails to keep automation bounded.

## Quick Start Tutorial

![LoopAutoma UI](./doc/img/ui-screenshot.png)

**Get the latest release** (v0.1.2) with pre-built installers for Linux, macOS, and Windows:

- **Linux**: [.deb](https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma_0.1.1_amd64.deb) • [.rpm](https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma-0.1.1-1.x86_64.rpm) • [AppImage](https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma_0.1.1_amd64.AppImage)
- **macOS**: [Intel](https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma_0.1.1_x64.dmg) • [Apple Silicon](https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma_0.1.1_aarch64.dmg)
- **Windows**: [Installer](https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma_0.1.1_x64-setup.exe) • [MSI](https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma_0.1.1_x64_en-US.msi)

### Ubuntu/Debian Example

```bash
# Download and install
wget https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma_0.1.1_amd64.deb
sudo apt install ./loopautoma_0.1.1_amd64.deb

# Run the app
loopautoma
```

**Note**: Linux requires an X11 session (not Wayland). Check with `echo "$XDG_SESSION_TYPE"` — if it shows `wayland`, switch to X11 at the login screen.

### Using the Copilot Keep-Alive Preset

The app loads with a ready-to-use preset that keeps AI agents (like VS Code Copilot) running:

1. **Define watch regions**: Click "Define watch region" and drag over areas where your agent shows output or progress indicators
2. **Start monitoring**: Hit "Start" — the app watches for UI changes and types "continue" + Enter when activity stops
3. **Walk away confidently**: Built-in guardrails (5s cooldown, 3h max runtime, 120 activations/hour) keep automation safe

**Advanced**: Use the Recording feature to capture custom action sequences, or edit profiles via the Graphical Composer or JSON editor.

### Build from Source (Optional)

For development or customization:

```bash
git clone https://github.com/chrisgleissner/loopautoma.git
cd loopautoma
bun install
bun run dev
```

See **[doc/install.md](doc/install.md)** for system requirements, troubleshooting, and detailed build instructions.

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
