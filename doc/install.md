# Loop Automa — Installation Guide

This guide covers installation of Loop Automa on Ubuntu 24.04 (X11 session). macOS and Windows support will be added in future releases.

## System Requirements

### Ubuntu 24.04 (Primary Target)

- **Display Server**: X11 session required (Wayland is **not supported** for MVP)
- **Architecture**: x86_64 (amd64)
- **Desktop Environment**: Any (GNOME, KDE, XFCE, etc.)

### Checking Your Display Server

Loop Automa requires an X11 session for screen capture, input recording, and input automation. To check your current session type:

```bash
echo "$XDG_SESSION_TYPE"
```

- If this prints `x11`, you're good to go.
- If this prints `wayland`, you need to switch to an X11 session (see below).

### Switching from Wayland to X11

On Ubuntu 24.04 with GNOME:

1. Log out of your current session
2. At the login screen, click your username
3. Click the gear icon (⚙️) in the bottom-right corner
4. Select **"Ubuntu on Xorg"** or **"GNOME on Xorg"**
5. Enter your password and log in

The change persists across reboots until you manually switch back.

## Installation Methods

### Method 1: From Pre-built Packages (Recommended)

Loop Automa provides pre-built packages for Ubuntu:

#### .deb Package (Ubuntu/Debian)

```bash
# Download the latest .deb package
wget https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma_0.1.0_amd64.deb

# Install via apt
sudo apt install ./loopautoma_0.1.0_amd64.deb

# Run the application
loopautoma
```

The .deb package will automatically install required system dependencies.

#### .rpm Package (Fedora/RHEL-based)

```bash
# Download the latest .rpm package
wget https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma-0.1.0-1.x86_64.rpm

# Install via dnf/yum
sudo dnf install ./loopautoma-0.1.0-1.x86_64.rpm

# Run the application
loopautoma
```

#### AppImage (Universal Linux)

The AppImage is a portable executable that works on most Linux distributions without installation:

```bash
# Download the AppImage
wget https://github.com/chrisgleissner/loopautoma/releases/latest/download/loopautoma_0.1.0_amd64.AppImage

# Make it executable
chmod +x loopautoma_0.1.0_amd64.AppImage

# Run directly
./loopautoma_0.1.0_amd64.AppImage
```

**Note**: The AppImage still requires X11 and may need some system libraries installed manually. If you encounter errors, install the dependencies listed below.

### Method 2: Build from Source

Building from source gives you the latest development version.

#### Prerequisites

Install the required development tools and libraries:

```bash
# Install Rust toolchain
curl https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"

# Install Bun (JavaScript runtime and package manager)
curl -fsSL https://bun.sh/install | bash

# Install system dependencies
sudo apt update
sudo apt install -y \
  pkg-config build-essential libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev patchelf \
  libx11-dev libxext-dev libxrandr-dev \
  libxi-dev libxtst-dev \
  libxkbcommon-dev libxkbcommon-x11-dev \
  libpipewire-0.3-dev libspa-0.2-dev \
  clang llvm-dev libc6-dev
```

#### Build and Package

```bash
# Clone the repository
git clone https://github.com/chrisgleissner/loopautoma.git
cd loopautoma

# Install dependencies
bun install

# Build release packages (creates .deb, .rpm, .AppImage)
bun run build

# Find the packages in:
ls -lh src-tauri/target/release/bundle/

# Build a web-only bundle (no desktop shell)
bun run build:web
```

#### Development Workflows

- **Install JS deps**: `bun install`
- **Full desktop app with hot reload**: `bun run dev`
- **Safe mode (no real automation)**: `LOOPAUTOMA_BACKEND=fake bun run dev`
- **Pure web UI (no Tauri shell)**: `bun run dev:web`
- **Rust tests**: `cd src-tauri && cargo test --all --locked`
- **Rust coverage**: `cd src-tauri && cargo llvm-cov --workspace --locked --lcov --output-path lcov.info`

### Containerized Dev/Test

Loop Automa ships with a reproducible Docker image (see `Dockerfile`) that bundles all Linux dependencies, Rust, Bun, and the tooling used in CI. Build it once, then reuse it locally or in CI:

```bash
# Build the CI/dev image locally
docker build -t loopautoma/ci:local .

# Run UI tests inside the container
docker run --rm -v "$PWD:/workspace" -w /workspace loopautoma/ci:local \
  bash -lc 'bun install && bun run test:ui:cov'

# Run Rust tests inside the container
docker run --rm -v "$PWD:/workspace" -w /workspace loopautoma/ci:local \
  bash -lc 'cd src-tauri && cargo test --all --locked'
```

> The GitHub Actions pipeline reuses this same image, so local runs mirror CI exactly.

## System Dependencies

Loop Automa requires these runtime libraries on Ubuntu 24.04:

### Core Dependencies

- WebKitGTK 4.1 (webkit2gtk-4.1)
- GTK 3 (libgtk-3-0)
- libsoup 3 (libsoup-3.0-0)
- librsvg2-2

### X11 Libraries

- libx11-6
- libxext6
- libxrandr2
- libxi6
- libxtst6
- libxkbcommon0
- libxkbcommon-x11-0

### Media/Capture Libraries

- libpipewire-0.3-0
- libspa-0.2-modules

Most of these are pre-installed on Ubuntu Desktop. If you encounter missing library errors, install them via:

```bash
sudo apt install -y \
  libwebkit2gtk-4.1-0 libgtk-3-0 libsoup-3.0-0 librsvg2-2 \
  libx11-6 libxext6 libxrandr2 libxi6 libxtst6 \
  libxkbcommon0 libxkbcommon-x11-0 \
  libpipewire-0.3-0 libspa-0.2-modules
```

## First Run

When you first launch Loop Automa:

1. **Grant Permissions**: On some systems, you may be prompted to grant accessibility permissions for input automation. This is required for the app to simulate keyboard and mouse input.

2. **Check X11 Session**: If the app warns about Wayland, follow the instructions above to switch to an X11 session.

3. **Load or Create a Profile**: The app will start with a default "Keep AI Agent Active" profile. You can modify it or create new profiles in the UI.

4. **Test with Safe Mode**: Before running automation on production systems, test with `LOOPAUTOMA_BACKEND=fake` to verify your profile logic without executing real input events:

   ```bash
   LOOPAUTOMA_BACKEND=fake loopautoma
   ```

## Troubleshooting

### "Cannot connect to X server" or X11 errors

**Cause**: Not running in an X11 session, or DISPLAY not set.

**Solution**:
1. Verify X11 session: `echo "$XDG_SESSION_TYPE"` should print `x11`
2. Check DISPLAY variable: `echo "$DISPLAY"` should be set (typically `:0` or `:1`)
3. Switch to X11 session at login screen (see "Switching from Wayland to X11" above)

### "Failed to initialize input capture" errors

**Cause**: Missing X11 development libraries or permissions.

**Solution**:
```bash
sudo apt install -y libxi6 libxtst6 libxkbcommon-x11-0
```

If the problem persists, run in safe mode to verify other functionality:
```bash
LOOPAUTOMA_BACKEND=fake loopautoma
```

### "Screen capture unavailable" errors

**Cause**: Missing PipeWire/screen capture libraries.

**Solution**:
```bash
sudo apt install -y libpipewire-0.3-0 libspa-0.2-modules
```

### AppImage won't run

**Cause**: Missing FUSE or system libraries.

**Solution**:
```bash
# Install FUSE for AppImage support
sudo apt install -y libfuse2

# Or extract and run directly:
./loopautoma_0.1.0_amd64.AppImage --appimage-extract
./squashfs-root/AppRun
```

## Uninstallation

### .deb Package

```bash
sudo apt remove loopautoma
```

### .rpm Package

```bash
sudo dnf remove loopautoma
```

### AppImage

Simply delete the AppImage file. No system files are installed.

### Built from Source

```bash
cd loopautoma
bun run tauri clean
```

## Known Limitations (MVP)

- **Wayland Not Supported**: Loop Automa requires an X11 session. Wayland's security model prevents the global input capture and automation required for unattended operation. Support for Wayland-compatible automation may be added in future releases if technically feasible.

- **Ubuntu 24.04 Only**: The MVP is tested and supported on Ubuntu 24.04 LTS. Other Linux distributions may work but are not officially supported yet.

- **Single Monitor Preference**: The region picker overlay launches on the currently focused display; if you're authoring on a secondary monitor, move the app window there before starting the picker.

## Security and Privacy

Loop Automa is designed with security and privacy in mind:

- **No Data Collection**: No telemetry or usage data is sent to external servers
- **Local Operation**: All automation runs locally on your machine
- **Hash-Only Region Monitoring**: By default, only downscaled image hashes are compared, not full pixel data
- **Explicit Permissions**: The app requires accessibility permissions for input automation, which you grant explicitly
- **Guardrails**: Cooldown, runtime, and activation limits ensure automation remains bounded; the monitor can always be stopped from the main UI.

## Next Steps

- **Documentation**: See [doc/architecture.md](architecture.md) for technical details
- **Developer Guide**: See [doc/developer.md](developer.md) for development setup
- **Rollout Plan**: See [doc/rollout-plan.md](rollout-plan.md) for the project roadmap

## Support

For issues, questions, or contributions:
- **GitHub Issues**: https://github.com/chrisgleissner/loopautoma/issues
- **Discussions**: https://github.com/chrisgleissner/loopautoma/discussions
