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
  libssl-dev \
  patchelf \
  clang \
  llvm-dev \
  libclang-dev \
  libc6-dev \
  cmake \
  xz-utils \
  sudo \
  libglib2.0-dev \
  libcairo2-dev \
  libpango1.0-dev \
  libgdk-pixbuf-2.0-dev \
  libatk1.0-dev \
  libgtk-3-dev \
  libjavascriptcoregtk-4.1-dev \
  libsoup-3.0-dev \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  libayatana-appindicator3-dev \
  libpipewire-0.3-dev \
  libspa-0.2-dev \
  libgbm-dev \
  libdrm-dev \
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

**Note:** The above package list includes all dependencies for building with the `os-linux-capture-xcap` feature (libpipewire-0.3-dev, libspa-0.2-dev). This feature requires Ubuntu 24.04+ or equivalent (libspa 0.8.0 compatibility). The default Linux release build uses this feature for screen monitoring.

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
bun run generate:ui-screenshot  # deterministic doc/img/ui-screenshot.png refresh via Playwright
bun scripts/updateVersionsFromTag.ts v0.4.0  # align package.json/Tauri/Cargo versions before tagging
cd src-tauri && cargo test --all --locked                 # Rust tests
cd src-tauri && cargo llvm-cov --workspace --locked --lcov --output-path lcov.info
```

### Screenshot automation pipeline

- `bun run generate:ui-screenshot` launches a Vite preview server, applies the dark theme, injects sample events, and grabs a full-height PNG via Playwright.
- `bun run build:web` already calls the generator at the end of the build; run the standalone command only when you want to refresh the screenshot without rebuilding.
- Output is written to `doc/img/ui-screenshot.png` only when the bytes change, keeping git diffs minimal. Use this before updating docs/README screenshots.

### Desktop vs web detection

- Region overlays, thumbnails, and input recording now rely on a single `isDesktopEnvironment` helper that checks for Tauri globals, user-agent markers, and the new `window.__LOOPAUTOMA_FORCE_DESKTOP__` escape hatch.
- Packaged builds (AppImage, .deb, .dmg, .msi) automatically satisfy one of the detection paths, so the “Run the Tauri app instead of the web preview” warning should never appear in release artifacts.
- To debug overlay flows in a pure web preview (without Tauri IPC), add `window.__LOOPAUTOMA_FORCE_DESKTOP__ = true` in devtools before clicking “Define watch region.” Remove it afterwards to restore normal behavior.
- When reproducing desktop-only regressions, prefer running `bun run tauri dev` or the generated AppImage rather than `bun run dev`.

### ProfilesConfig (single-source persistence)

- The backend now treats all user data as one JSON document shaped as `{ "version": number, "profiles": Profile[] }` (see `doc/architecture.md`).
- `profiles_load`/`profiles_save` load and persist the entire object atomically, and the UI keeps a single copy in state via the JSON editor.
- Web preview mode stores the normalized config under `localStorage["loopautoma.profiles"]`, so you can wipe or seed data by editing that key.
- The JSON editor in the app always shows the full config; editing a single profile in Graph Composer or Region panel mutates the same document, so both stay in sync automatically.

### Release tagging and version sync

- The release workflow derives installer metadata from the pushed tag. Run `bun scripts/updateVersionsFromTag.ts vX.Y.Z` locally to preview changes before tagging.
- On CI, `.github/workflows/release.yaml` invokes the same script (with `GITHUB_REF_NAME`) immediately after setting up Bun. If the tag is malformed (not `vMAJOR.MINOR.PATCH`), the script fails fast and stops the job.
- The script updates `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` (if present). Commit these updates alongside your release prep branch so that the tag matches the manifest versions.

### E2E tests (Playwright)

```bash
# Run headless E2E tests against the web preview (Vite dev server)
bun run test:e2e

# Run E2E tests with Istanbul instrumentation and combine coverage into coverage-e2e/lcov.info
bun run test:e2e:cov

# OPTIONALLY open the HTML report after (does not block the test run)
bun run test:e2e:report
```

Notes:

- The Playwright HTML reporter is configured not to auto-open (open: "never") to avoid blocking terminals and agent sessions. If you need the report, run the separate `test:e2e:report` command.
- If a previous command appears to hang with a message like "Serving HTML report at `http://localhost:XXXX`", stop it with Ctrl+C and use the explicit report command instead.

## 3. Cross‑OS (macOS + Windows) Backends

Phase 3 work adds first-party backends for macOS (capture today, input later) and Windows (stubs). These builds are opt-in so the Linux MVP stays lean. Use feature flags to target each OS:

```bash
# macOS-only build/test (run on a macOS host for real backends)
cd src-tauri
cargo check --no-default-features --features os-macos
cargo test --no-default-features --features os-macos

# Windows-only build/test (still stubs, but keeps the code compiling)
cargo check --no-default-features --features os-windows
```

- `bun run tauri dev`/`bun run tauri build` forward extra cargo args. Example (macOS capture build):

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
- If E2E runs seem to block, verify the HTML report server is not running in the foreground. Our config disables auto-open; prefer `bun run test:e2e:report` to view results.

### Input Recording Troubleshooting

If you click "Record" and see an error modal or the recording never starts, check the following:

#### Prerequisite: X11 Session (NOT Wayland)

Input recording requires an X11 session. Most modern Linux distributions default to Wayland.

**Check your session type:**
```bash
echo $XDG_SESSION_TYPE
```

If it shows `wayland`, you must switch to X11:

1. Log out of your current session
2. At the login screen, click the gear icon (⚙️) in the bottom-right
3. Select "Ubuntu on Xorg" or "GNOME on Xorg"
4. Log back in
5. Verify: `echo $XDG_SESSION_TYPE` should now show `x11`

#### Prerequisite: X11 Development Libraries

Input recording requires the XInput and XTest extensions:

```bash
sudo apt update
sudo apt install -y libx11-dev libxext-dev libxi-dev libxtst-dev libxkbcommon-dev libxkbcommon-x11-dev libxcb-xkb-dev
```

After installing, rebuild the app:
```bash
cd src-tauri && cargo build
```

#### Prerequisite: No LOOPAUTOMA_BACKEND=fake

If you set `LOOPAUTOMA_BACKEND=fake` to run in safe mode, input recording will be disabled.

**Check:**
```bash
env | grep LOOPAUTOMA_BACKEND
```

If it shows `fake`, unset it:
```bash
unset LOOPAUTOMA_BACKEND
```

Then restart the app.

#### Built-in Diagnostics

The app now includes automatic prerequisite checking. When you click "Record", if any requirements are not met, you'll see a detailed error modal showing:

- ✓/✗ X11 Session type
- ✓/✗ X11 Connection (DISPLAY environment variable)
- ✓/✗ XInput extension available
- ✓/✗ XTest extension available
- ✓/✗ Real backend (not fake mode)
- ✓/✗ Feature compiled (os-linux-automation)

The modal includes copy-pasteable fix commands for each issue.

#### Common Issues

**"Cannot connect to X11 server"**
- Ensure `DISPLAY` is set: `echo $DISPLAY` should show `:0` or `:1`
- If running over SSH, use `ssh -X` for X11 forwarding
- If in a VM, ensure X11 passthrough is enabled

**"XInput not available"**
- Install libxi-dev: `sudo apt install -y libxi-dev`
- Rebuild: `cd src-tauri && cargo build`

**"XTest extension not available"**
- Install libxtst-dev: `sudo apt install -y libxtst-dev`
- Rebuild: `cd src-tauri && cargo build`

**Recording works but playback does nothing**
- Playback also requires X11 and XTest
- Check that the app has permission to inject input events (some security tools block this)
- Verify with `xdotool` (if installed): `xdotool mousemove 100 100` should move the cursor

**Wayland Detection**
- If you must use Wayland, input recording will not work (X11-specific)
- Consider using XWayland in the interim, though native Wayland support may come in a future release via libei

### Action Playback and Automation

Action playback uses X11's XTest extension for mouse/keyboard simulation and XWarpPointer for cursor movement.

#### Keyboard Mapping (XKB Fallback)

The app attempts to use live XKB keyboard mapping from your X11 session, but will automatically fall back to a static US QWERTY keymap if XKB initialization fails. You'll see one of these logs:

**Success (live XKB):**
```
[XKB] Successfully found core keyboard with device_id=3
[LinuxAutomation] Using live XKB keymap from X11
```

**Fallback (static QWERTY):**
```
[XKB] get_core_keyboard_device_id returned: -1
[XKB] Falling back to static US QWERTY keymap
[LinuxAutomation] Keyboard lookup initialized successfully with 67 key mappings
```

**This is normal and expected** in Tauri apps and sandboxed environments. The static fallback covers:
- All lowercase letters (a-z)
- All uppercase letters (A-Z with shift)
- Numbers (0-9)
- Special keys: Enter, Escape, Tab, Space, Backspace

**Non-US Keyboard Layouts:**
If you use a non-US layout and XKB fallback occurs, some keys may not type correctly. To enable live XKB:
- Ensure `libxkbcommon-x11-dev` is installed
- Run the app from a terminal (not launcher) to inherit full X11 context
- Check X11 security policies (`xhost` settings)

#### Detailed Automation Logging

To see detailed logs of every cursor move, click, and keystroke:

```bash
bun run tauri dev 2>&1 | grep "\[Automation\]"
```

You should see logs like:
```
[Automation] Moving cursor to (70, 251)
[Automation] Cursor now at (70, 251), target was (70, 251)
[Automation] Mouse Left button DOWN
[Automation] Mouse Left button UP
[Automation] Typing text: "hello world[Enter]" (18 chars)
[Automation] Typing char 'h' (keysym=68)
[Automation] Key DOWN keycode=43
[Automation] Key UP keycode=43
...
[Automation] Pressing special key: [Enter]
[Automation] Key DOWN keycode=36
[Automation] Key UP keycode=36
[Automation] Finished typing 11 characters
```

#### Common Playback Issues

**Cursor doesn't move visibly**
- The app uses `XWarpPointer` to physically move the cursor (not just generate motion events)
- Verify X11 works with `xdotool` (install with `sudo apt install xdotool` if needed): `xdotool mousemove 500 500` should move cursor to (500, 500)
- Some window managers may restrict cursor warping; check WM security settings

**Clicks don't register in target window**
- Window may need to be focused first (add a click action before typing)
- Some apps ignore synthetic events for security (e.g., sudo prompts, lock screens)
- Try adding a small delay (50-100ms) before clicking

**Text doesn't appear or wrong characters typed**
- If using non-US layout with XKB fallback, switch to live XKB or use US QWERTY
- Check that target window has focus and accepts keyboard input
- Some apps filter synthetic keyboard events (rare)

**Special keys like [Enter] don't work**
- Verify bracket syntax: `[Enter]` not `{Enter}` or `<Enter>`
- Check logs to confirm special key was detected and sent
- Available keys: Enter, Escape, Tab, Space, Backspace (case-insensitive)

