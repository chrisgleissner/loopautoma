# Release Build Guide

This document provides step-by-step instructions for building release artifacts for all supported platforms.

## Overview

Loop Automa supports the following platforms:
- **macOS**: aarch64 (Apple Silicon) and x86_64 (Intel)
- **Linux**: x86_64 (Ubuntu 24.04+)
- **Windows**: x86_64-msvc

## Critical Rules

### ❌ DO NOT include test dependencies in release builds

- The `build:web` script must NEVER call `generate:ui-screenshot`
- Playwright is a devDependency and must not be required for production builds
- Screenshots are development artifacts only (for docs/README)

### ✅ Use the correct npm script

- **Release builds**: `bun run build:web` (no screenshot generation)
- **Development builds with screenshots**: `bun run build:web:dev`

## Prerequisites

### All Platforms

1. **Rust toolchain** (stable, edition 2021)
   ```bash
   curl https://sh.rustup.rs -sSf | sh
   source "$HOME/.cargo/env"
   cargo --version  # Should be >= 1.75
   ```

2. **Bun** (latest)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   bun --version  # Should be >= 1.3
   ```

3. **Tauri CLI** (installed automatically via bun)
   ```bash
   bun install --frozen-lockfile
   ```

### macOS-Specific

1. **Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```

2. **Rust targets for cross-compilation**
   ```bash
   rustup target add aarch64-apple-darwin
   rustup target add x86_64-apple-darwin
   ```

### Linux-Specific (Ubuntu 24.04+)

**Why Ubuntu 24.04+?** The `os-linux-capture-xcap` feature requires `libspa-0.2-dev` >= 0.8.0, which is only available in Ubuntu 24.04+.

1. **System dependencies**
   ```bash
   sudo apt-get update
   sudo apt-get install -y \
     pkg-config build-essential libssl-dev patchelf clang llvm-dev libclang-dev libc6-dev \
     libglib2.0-dev libcairo2-dev libpango1.0-dev libgdk-pixbuf-2.0-dev libatk1.0-dev \
     libgtk-3-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev libwebkit2gtk-4.1-dev \
     librsvg2-dev libayatana-appindicator3-dev libpipewire-0.3-dev libspa-0.2-dev \
     libgbm-dev libdrm-dev libx11-dev libxext-dev libxrandr-dev libxi-dev libxtst-dev \
     libxkbcommon-dev libxkbcommon-x11-dev libxcb-xkb-dev libxdo-dev
   ```

2. **Verify pkg-config files**
   ```bash
   pkg-config --exists glib-2.0 gobject-2.0 cairo pango gtk+-3.0 webkit2gtk-4.1 libsoup-3.0
   echo $?  # Should print 0
   ```

### Windows-Specific

1. **Visual Studio Build Tools** (with C++ Desktop Development workload)
   - Download from: https://visualstudio.microsoft.com/downloads/
   - Or install via winget: `winget install Microsoft.VisualStudio.2022.BuildTools`

2. **WebView2 Runtime** (usually pre-installed on Windows 11)
   - Download if needed: https://developer.microsoft.com/microsoft-edge/webview2/

## Build Commands

### macOS (Apple Silicon - aarch64)

```bash
cd /home/chris/dev/loopautoma
bun install --frozen-lockfile
bun tauri build --target aarch64-apple-darwin -- --no-default-features --features os-macos
```

**Output**: `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/loopautoma_0.1.1_aarch64.dmg`

### macOS (Intel - x86_64)

```bash
cd /home/chris/dev/loopautoma
bun install --frozen-lockfile
bun tauri build --target x86_64-apple-darwin -- --no-default-features --features os-macos
```

**Output**: `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/loopautoma_0.1.1_x64.dmg`

### Linux (x86_64)

```bash
cd /home/chris/dev/loopautoma
bun install --frozen-lockfile
bun tauri build -- --no-default-features --features os-linux-automation,os-linux-capture-xcap
```

**Output**: 
- AppImage: `src-tauri/target/release/bundle/appimage/loopautoma_0.1.1_amd64.AppImage`
- Debian package: `src-tauri/target/release/bundle/deb/loopautoma_0.1.1_amd64.deb`

### Windows (x86_64)

```powershell
cd C:\path\to\loopautoma
bun install --frozen-lockfile
bun tauri build -- --no-default-features --features os-windows
```

**Output**:
- Installer: `src-tauri\target\release\bundle\nsis\loopautoma_0.1.1_x64-setup.exe`
- MSI: `src-tauri\target\release\bundle\msi\loopautoma_0.1.1_x64_en-US.msi`

## Feature Flags Explained

### Linux Features

- `os-linux-automation`: X11 input automation and playback (libx11rb, xkbcommon)
- `os-linux-capture-xcap`: Screen capture via xcap (requires libspa-0.2-dev)

### macOS Features

- `os-macos`: Screen capture via screenshots crate

### Windows Features

- `os-windows`: Input automation and screen capture via Windows API

### Optional Features

- `llm-integration`: LLM prompt generation action (reqwest, tokio) - **enabled by default**

## CI/CD Workflow

The release workflow (`.github/workflows/release.yaml`) automatically builds for all platforms when a version tag is pushed:

```bash
git tag 0.1.2
git push origin 0.1.2
```

### Workflow Matrix

| Platform | Runner | Target | Features |
|----------|--------|--------|----------|
| macOS (aarch64) | `macos-latest` | `aarch64-apple-darwin` | `os-macos` |
| macOS (x86_64) | `macos-latest` | `x86_64-apple-darwin` | `os-macos` |
| Linux | `ubuntu-24.04` | (native) | `os-linux-automation,os-linux-capture-xcap` |
| Windows | `windows-latest` | (native) | `os-windows` |

## Troubleshooting

### Error: "Playwright is not installed"

**Symptom**: Build fails with message about missing Playwright browsers.

**Cause**: `build:web` script incorrectly includes `generate:ui-screenshot`.

**Fix**: Verify `package.json` has:
```json
"build:web": "tsc --noEmit --project tsconfig.app.json && vite build"
```

NOT:
```json
"build:web": "tsc --noEmit --project tsconfig.app.json && vite build && bun run generate:ui-screenshot"
```

### Error: "Missing .pc file for webkit2gtk-4.1" (Linux)

**Symptom**: Cargo build fails with `pkg-config` errors about missing libraries.

**Cause**: System dependencies not installed or wrong Ubuntu version.

**Fix**:
1. Verify Ubuntu version: `lsb_release -a` (must be 24.04+)
2. Install all dependencies from the "Linux-Specific" section above
3. Run validation: `pkg-config --modversion webkit2gtk-4.1`

### Error: "Cannot find X11 libraries" (Linux)

**Symptom**: Linking fails with undefined references to X11 functions.

**Cause**: Missing X11 development headers.

**Fix**:
```bash
sudo apt-get install -y libx11-dev libxext-dev libxi-dev libxtst-dev \
  libxkbcommon-dev libxkbcommon-x11-dev libxcb-xkb-dev
```

### Error: "MSVC linker not found" (Windows)

**Symptom**: Cargo cannot find `link.exe`.

**Cause**: Visual Studio Build Tools not installed or not in PATH.

**Fix**:
1. Install Visual Studio Build Tools with C++ workload
2. Open "Developer Command Prompt for VS 2022"
3. Run build from that shell

### Error: "Cross-compilation failed" (macOS)

**Symptom**: Building for aarch64 on x86_64 Mac (or vice versa) fails.

**Cause**: Missing Rust target.

**Fix**:
```bash
rustup target add aarch64-apple-darwin
rustup target add x86_64-apple-darwin
```

## Verification Checklist

Before tagging a release, verify:

- [ ] All platform builds complete successfully in CI
- [ ] No Playwright or test dependencies in release artifacts
- [ ] Bundle sizes are reasonable (< 50MB per platform)
- [ ] Installers launch correctly on real machines
- [ ] App icon displays correctly on each platform
- [ ] Version numbers match in `package.json`, `Cargo.toml`, and `tauri.conf.json`

## Manual Testing

After building, test the installer on a clean machine:

1. **Install**: Run the installer/dmg/AppImage
2. **Launch**: Verify the app starts without errors
3. **Permissions**: Check that recording/screen capture permissions work
4. **Basic workflow**: Record → Save → Start → Verify automation runs
5. **Uninstall**: Ensure clean removal

## References

- Tauri build documentation: https://tauri.app/reference/cli/build
- Rust target triples: https://doc.rust-lang.org/nightly/rustc/platform-support.html
- GitHub Actions runners: https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners
