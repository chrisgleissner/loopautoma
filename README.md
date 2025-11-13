# Loopautoma

[![CI](https://github.com/chrisgleissner/loopautoma/actions/workflows/ci.yml/badge.svg)](https://github.com/chrisgleissner/loopautoma/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/chrisgleissner/loopautoma/graph/badge.svg?token=IdaePvWHB4)](https://codecov.io/gh/chrisgleissner/loopautoma)
[![License: GPL v2](https://img.shields.io/github/license/chrisgleissner/loopautoma)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-forestgreen)](doc/architecture.md)


Desktop automation that watches screen regions and takes actions when conditions are met. 


## Docs

- [Architecture](doc/architecture.md)
- [Rollout plan](doc/rollout-plan.md)
- [Dev setup & prerequisites](doc/developer.md)
- [Agent rules](.github/copilot-instructions.md)

## Install (Linux)

```bash
# Bun
curl -fsSL https://bun.sh/install | bash

# System packages for Tauri
sudo apt update
sudo apt install -y pkg-config build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev patchelf
```

## Run

```bash
# From the app root (once the app is scaffolded)
bun run tauri dev

# Tests (Bun)
bun test

# Rust tests (if src-tauri/ exists)
cd src-tauri && cargo test
```


## Installers (Linux)

Build packages locally:

```bash
bun run tauri build
```

Artifacts will be generated under `src-tauri/target/release/bundle/` (e.g., `.deb`, `.rpm`, `.AppImage`).

