# Developer Notes

Date: 2025-11-14

This file is a lightweight scratchpad for contributors. It lists the exact commands to prepare a Linux dev box (Ubuntu 24.04 + X11) and the day-to-day scripts we actually run. For OS-specific behavior, contracts, and roadmap context, defer to `doc/architecture.md` and `doc/rollout-plan.md`.

## 1. Linux Setup (Ubuntu 24.04 + X11)

### System packages

Run one block to install every native dependency used in CI (matches `Dockerfile`):

```bash
sudo apt update && \
sudo apt install -y --no-install-recommends \
  ca-certificates \
  curl \
  wget \
  unzip \
  git \
  pkg-config \
  build-essential \
  libgbm-dev \
  libdrm-dev \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libsoup-3.0-dev \
  librsvg2-dev \
  patchelf \
  libayatana-appindicator3-dev \
  clang \
  llvm-dev \
  libpipewire-0.3-dev \
  libspa-0.2-dev \
  libclang-dev \
  libc6-dev \
  cmake \
  xz-utils \
  sudo \
  libx11-dev \
  libxext-dev \
  libxrandr-dev \
  libxi-dev \
  libxtst-dev \
  libxkbcommon-dev \
  libxkbcommon-x11-dev \
  libxcb-xkb-dev \
  libxdo-dev
```

### Toolchains

```bash
# Rust (installs cargo + rustc). Accept defaults, then source the env file.
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Bun (preferred JS runtime/package manager)
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

Verify everything once:

```bash
rustc -V
cargo -V
bun -v
echo "$XDG_SESSION_TYPE"   # should print x11
```

## 2. Daily Commands

```bash
bun install                # install JS deps
bun run dev                # launch full Tauri app (X11 only)
LOOPAUTOMA_BACKEND=fake bun run dev   # safe mode, no real input
bun run dev:web            # pure web dev server
bun run build              # desktop bundles (.deb/.rpm/.AppImage under src-tauri/target/release/bundle/)
bun run build:web          # UI bundle only
cd src-tauri && cargo test --all --locked                 # Rust tests
cd src-tauri && cargo llvm-cov --workspace --locked --lcov --output-path lcov.info
```

## 3. Cross‑OS (macOS + Windows) Preview

Phase 3 work adds first-party backends for macOS (capture today, input later) and Windows (stubs). These builds are opt-in so the Linux MVP stays lean. Use feature flags to target each OS:

```bash
# macOS-only build/test (run on a macOS host for real backends)
cd src-tauri
cargo check --no-default-features --features os-macos
cargo test --no-default-features --features os-macos

# Windows-only build/test (still stubs, but keeps the code compiling)
cargo check --no-default-features --features os-windows
```

- `bun run tauri dev`/`bun run tauri build` forward extra cargo args. Example (macOS capture preview):

  ```bash
  bun run tauri dev -- --no-default-features --features os-macos
  bun run tauri build -- --no-default-features --features os-macos
  ```

- macOS capture uses the `screenshots` crate, which triggers the Screen Recording permission prompt. Accept it or enable it manually under **System Settings → Privacy & Security → Screen Recording**.
- Windows builds are still headless stubs (automation/input pending). Keep `LOOPAUTOMA_BACKEND=fake` when running UI flows there.
- Cross-compiling desktop bundles still requires building on the target OS (or the official Tauri cross images/signing pipelines). The Linux CI job only publishes Linux artifacts today.

## 4. Tips & Troubleshooting

- `src-tauri/.cargo/config.toml` already exports `BINDGEN_EXTRA_CLANG_ARGS=--sysroot=/usr -I/usr/lib/llvm-18/lib/clang/18/include -I/usr/include/x86_64-linux-gnu`, so local `cargo` picks up the same headers as CI.
- If the hardware capture/input crates fail to build, re-run the apt block above and confirm you are on an X11 session. To unblock development without native hooks, use `LOOPAUTOMA_BACKEND=fake bun run dev`.
- Want reproducible tooling without touching the host? Build the CI image locally (`docker build -t loopautoma/ci:local .`) and run commands inside: `docker run --rm -v "$PWD:/workspace" -w /workspace loopautoma/ci:local bash -lc 'bun install && bun run dev'`.
